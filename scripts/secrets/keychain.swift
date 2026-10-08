import Foundation
import Security

struct Request: Decodable {
    let operation: String
    let service: String
    let keys: [String]
    let values: [String: String]?
}

struct Response: Encodable {
    let values: [String: String]
}

enum KeychainFailure: Error {
    case invalidRequest
    case status(OSStatus)
}

func query(service: String, key: String) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword,
     kSecAttrService as String: service,
     kSecAttrAccount as String: key,
     kSecAttrSynchronizable as String: false]
}

func read(service: String, key: String) throws -> String? {
    var attributes = query(service: service, key: key)
    attributes[kSecReturnData as String] = true
    attributes[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(attributes as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess else { throw KeychainFailure.status(status) }
    guard let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
        throw KeychainFailure.invalidRequest
    }
    return value
}

func write(service: String, key: String, value: String) throws {
    let attributes = query(service: service, key: key)
    let update = [kSecValueData as String: Data(value.utf8)]
    let status = SecItemUpdate(attributes as CFDictionary, update as CFDictionary)
    if status == errSecItemNotFound {
        var item = attributes
        item[kSecValueData as String] = Data(value.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let created = SecItemAdd(item as CFDictionary, nil)
        guard created == errSecSuccess else { throw KeychainFailure.status(created) }
    } else if status != errSecSuccess {
        throw KeychainFailure.status(status)
    }
}

do {
    let request = try JSONDecoder().decode(Request.self, from: FileHandle.standardInput.readDataToEndOfFile())
    guard request.service.hasPrefix("com.pcobooster.secrets."), ["read", "write"].contains(request.operation) else {
        throw KeychainFailure.invalidRequest
    }
    var values: [String: String] = [:]
    for key in request.keys {
        if request.operation == "write" {
            guard let value = request.values?[key] else { throw KeychainFailure.invalidRequest }
            try write(service: request.service, key: key, value: value)
        }
        if let value = try read(service: request.service, key: key) { values[key] = value }
    }
    FileHandle.standardOutput.write(try JSONEncoder().encode(Response(values: values)))
} catch {
    // Never print input, values, or decoder errors (which can quote input).
    let message: String
    if case KeychainFailure.status(let status) = error {
        message = "Keychain operation failed (OSStatus \(status)). Unlock your login Keychain and allow access if prompted.\n"
    } else {
        message = "Invalid Keychain request.\n"
    }
    FileHandle.standardError.write(Data(message.utf8))
    exit(1)
}
