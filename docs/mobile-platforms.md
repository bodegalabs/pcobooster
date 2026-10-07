# Mobile platform scope

The current delivery targets iPhone and iPad. Both expose the same Services, Plan, Assign, People, Songs, and Search workflows through the typed product client. Native tab and stack navigation adapt to each device; reproducing the old Swift screen layouts is outside the agreed scope.

The Expo configuration enables the iPad device family and device rotation. Functional verification must cover portrait and landscape on an iPad, including navigation, readable scrolling content, keyboard search, detail screens, and dismissing sheets. A simulator result does not establish physical-device or signed TestFlight acceptance.

Android implementation and acceptance are deferred. Do not infer Android support from shared React Native source.

Release acceptance remains separate: installed Release startup, session/cache restoration, offline recovery, and production diagnostics delivery and symbolication must be verified against the exact distributed build. Local prepare/export tooling never uploads automatically.
