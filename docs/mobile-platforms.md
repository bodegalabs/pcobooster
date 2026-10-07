# Mobile platform scope

The current delivery targets iPhone and iPad. Both expose the same Services, Plan, Assign, People, Songs, and Search workflows through the typed product client. Native tab and stack navigation adapt to each device; reproducing the old Swift screen layouts is outside the agreed scope.

The Expo configuration enables the iPad device family and device rotation. Functional verification must cover portrait and landscape on an iPad, including navigation, readable scrolling content, keyboard search, detail screens, and dismissing sheets. A simulator result does not establish physical-device or signed TestFlight acceptance.

Android implementation and acceptance are deferred. Do not infer Android support from shared React Native source.

| Platform | Build target | Acceptance coverage |
| --- | --- | --- |
| iPhone | iOS 16.4 or later | Current local verification uses the iOS 27 simulator. Older supported OS versions and physical devices still need acceptance. |
| iPad | iPadOS 16.4 or later | Current local verification uses the iPadOS 27 simulator; portrait and landscape coverage is recorded against the tested revision. Older supported OS versions and physical devices still need acceptance. |
| Android | Deferred | No supported release or acceptance claim. |

The minimum is explicit in `apps/mobile/app.config.ts` and matches the installed Expo SDK's native module floor. A deployment target establishes installation eligibility, not successful testing on every eligible OS version.

Release acceptance remains separate: installed Release startup, session/cache restoration, offline recovery, and production diagnostics delivery and symbolication must be verified against the exact distributed build. Local prepare/export tooling never uploads automatically.
