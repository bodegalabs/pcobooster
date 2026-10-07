# Mobile Search features

Search replaces the Expo placeholder with the existing Swift feature domains. It uses the organization-wide typed product API and the current account's query cache.

- Plans match service name, title, series and the written date in the congregation time zone. Upcoming plans precede past plans. Catalog keys are shared with Services; plan reads enter in batches of four. Failed service types remain visible as partial results with retry.
- People searches require two characters and People access. People and Songs destinations follow the account's feature flags and permissions. Songs omit hidden catalog entries.
- Provider queries wait 300 milliseconds after typing stops. Query keys include account scope and settled text. Obsolete answers cannot replace the newer query's results, and reads consume the abort signal.
- Search scopes select All, Plans, People or Songs. Results preserve stable person/song IDs and both service-type and plan IDs.
- The last ten submitted queries are saved per account context, can be reused and cleared, and are validated when restored. Unlike Swift's mixed recent-entity list, opening a result remembers the query that found it.
- Loading, no-result, permission and retry states are explicit. Search remains editable when offline; cached results stay scoped to their account.

The Swift references are `Features/Search/SearchModel.swift`, `SearchCatalog.swift`, `PlanSearch.swift`, `RecentSearches.swift` and `SearchScope.swift` at `5f5eec65`. The new layout intentionally uses the existing React Native primitives; matching Swift visuals is outside scope. Fixture tests cover typed request encoding, cancellation and independent query keys, destination encoding, recent-query validation and a congregation date whose UTC day differs. Rendered iPhone/iPad and keyboard-flow acceptance is recorded separately against the integrated revision.
