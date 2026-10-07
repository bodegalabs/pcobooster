// Runs one Hermes bytecode bundle in the macOS slice of the hermesvm framework the app ships,
// configured like React Native's bridgeless HermesInstance (microtask queue on, a 3 GB heap).
//
// Usage: runner <bundle.hbc>
//
// - Refuses plain JavaScript, so a probe cannot pass without going through hermesc.
// - Installs `__pcobReport(json)`, which prints one result line, and virtual-time
//   `setTimeout`/`clearTimeout`/`setImmediate`, which fire in order without sleeping.
// - Exits 1 with the JS message and stack on an uncaught exception, as a fatal startup error does.
#include <hermes/hermes.h>
#include <jsi/jsi.h>

#include <fstream>
#include <iostream>
#include <iterator>
#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace jsi = facebook::jsi;

namespace {

constexpr int kUsage = 64;
constexpr int kMaxTimerTurns = 100000;

struct Timer {
  std::shared_ptr<jsi::Function> callback;
};

class Buffer : public jsi::Buffer {
 public:
  explicit Buffer(std::vector<uint8_t> bytes) : bytes_(std::move(bytes)) {}
  size_t size() const override { return bytes_.size(); }
  const uint8_t *data() const override { return bytes_.data(); }

 private:
  std::vector<uint8_t> bytes_;
};

}  // namespace

int main(int argc, char **argv) {
  if (argc != 2) {
    std::cerr << "usage: runner <bundle.hbc>" << std::endl;
    return kUsage;
  }
  std::ifstream file(argv[1], std::ios::binary);
  std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
  auto *root = jsi::castInterface<facebook::hermes::IHermesRootAPI>(facebook::hermes::makeHermesRootAPI());
  if (root == nullptr || !root->isHermesBytecode(bytes.data(), bytes.size())) {
    std::cerr << argv[1] << " is not Hermes bytecode" << std::endl;
    return kUsage;
  }

  auto gc = ::hermes::vm::GCConfig::Builder().withMaxHeapSize(3072 << 20).withName("RNBridgeless").build();
  auto runtime = facebook::hermes::makeHermesRuntime(
      ::hermes::vm::RuntimeConfig::Builder().withGCConfig(gc).withMicrotaskQueue(true).build());
  jsi::Runtime &rt = *runtime;

  // Virtual time: (due, sequence) orders timers the way a real clock would, without waiting.
  std::map<std::pair<double, uint64_t>, Timer> timers;
  std::map<uint64_t, std::pair<double, uint64_t>> byId;
  double now = 0;
  uint64_t sequence = 0;

  auto schedule = [&](const jsi::Value *args, size_t count, double delay) -> jsi::Value {
    if (count < 1 || !args[0].isObject() || !args[0].getObject(rt).isFunction(rt)) {
      throw jsi::JSError(rt, "timer callback must be a function");
    }
    auto callback = std::make_shared<jsi::Function>(args[0].getObject(rt).getFunction(rt));
    const uint64_t id = ++sequence;
    const auto key = std::make_pair(now + (delay > 0 ? delay : 0), id);
    timers.emplace(key, Timer{callback});
    byId.emplace(id, key);
    return jsi::Value(static_cast<double>(id));
  };
  auto global = rt.global();
  global.setProperty(rt, "setTimeout",
      jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, "setTimeout"), 2,
          [&](jsi::Runtime &, const jsi::Value &, const jsi::Value *args, size_t count) {
            const double delay = count > 1 && args[1].isNumber() ? args[1].getNumber() : 0;
            return schedule(args, count, delay);
          }));
  global.setProperty(rt, "setImmediate",
      jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, "setImmediate"), 1,
          [&](jsi::Runtime &, const jsi::Value &, const jsi::Value *args, size_t count) {
            return schedule(args, count, 0);
          }));
  global.setProperty(rt, "clearTimeout",
      jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, "clearTimeout"), 1,
          [&](jsi::Runtime &, const jsi::Value &, const jsi::Value *args, size_t count) {
            if (count > 0 && args[0].isNumber()) {
              const auto found = byId.find(static_cast<uint64_t>(args[0].getNumber()));
              if (found != byId.end()) {
                timers.erase(found->second);
                byId.erase(found);
              }
            }
            return jsi::Value::undefined();
          }));
  global.setProperty(rt, "__pcobReport",
      jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, "__pcobReport"), 1,
          [](jsi::Runtime &inner, const jsi::Value &, const jsi::Value *args, size_t count) {
            if (count > 0) {
              std::cout << args[0].toString(inner).utf8(inner) << std::endl;
            }
            return jsi::Value::undefined();
          }));

  try {
    rt.evaluateJavaScript(std::make_shared<Buffer>(std::move(bytes)), argv[1]);
    rt.drainMicrotasks();
    for (int turn = 0; turn < kMaxTimerTurns && !timers.empty(); ++turn) {
      auto next = timers.begin();
      now = next->first.first;
      auto callback = next->second.callback;
      byId.erase(next->first.second);
      timers.erase(next);
      callback->call(rt);
      rt.drainMicrotasks();
    }
  } catch (const jsi::JSError &error) {
    std::cerr << error.getMessage() << "\n\n" << error.getStack() << std::endl;
    return 1;
  } catch (const std::exception &error) {
    std::cerr << error.what() << std::endl;
    return 1;
  }
  if (!timers.empty()) {
    std::cerr << "timers still pending after " << kMaxTimerTurns << " turns" << std::endl;
    return 1;
  }
  return 0;
}
