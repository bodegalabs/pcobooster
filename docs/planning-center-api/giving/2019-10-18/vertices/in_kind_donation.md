# InKindDonation

- App: `giving`
- Version: `2019-10-18`
- Vertex ID: `in_kind_donation`
- Endpoint: `https://api.planningcenteronline.com/giving/v2/documentation/2019-10-18/vertices/in_kind_donation`
- Resource path: `https://api.planningcenteronline.com/giving/v2/in_kind_donations`
- Collection only: `no`
- Deprecated: `no`


## Description

An `InKindDonation` record represents a non-cash gift given to an `Organization` at a specific time.

These include items like furniture, vehicles, services, or stocks. `InKindDonations` do not trigger
acknowledgment letter emails via the API; these must be sent from the Giving Admin UI.

[More info](https://pcogiving.zendesk.com/hc/en-us/articles/360040772154-In-kind-donations#enter-an-in-kind-donation-0)


## Attributes

| Name | Type | Description | Permission |
| --- | --- | --- | --- |
| acknowledgment_last_sent_at | date_time (e.g. 2000-01-01T12:00:00Z) | The timestamp of when the acknowledgment letter was last sent for this in-kind donation. This value is set automatically and cannot be manually changed. | public |
| created_at | date_time (e.g. 2000-01-01T12:00:00Z) | The date and time at which an in-kind donation was created.  Example: `2000-01-01T12:00:00Z` | public |
| description | string (e.g. string) | Required. Brief description of an in-kind donation gift.  Example: `2019 Toyota Corolla (used)` | public |
| exchange_details | string (e.g. string) | Optional. Records whether any goods or services were exchanged for an in-kind donation.  Example: `In exchange, a charity event ticket for $100 was provided.` | public |
| fair_market_value_cents | integer (e.g. 1) | Optional. The fair market value of an in-kind donation in cents. Must be greater than $0 and less than or equal to $21,000,000. | public |
| fair_market_value_currency | currency_abbreviation (e.g. USD) | - | public |
| id | primary_key (e.g. primary_key) | The unique identifier for an in-kind donation. | public |
| received_on | date (e.g. 2000-01-01) | Required. The date an in-kind donation was received.  Format: `YYYY-MM-DD` (e.g. `2025-04-09`). | public |
| updated_at | date_time (e.g. 2000-01-01T12:00:00Z) | The date and time at which an in-kind donation was last updated.  Example: `2000-01-01T12:00:00Z` | public |
| valuation_details | string (e.g. string) | Optional. The fair market for an in-kind donation which should be determined by donors and appraisers. Maximum 255 characters. Example: `Appraised by Bob Johnson CPA (123 Easy Street, Carlsbad CA 92008)` | public |


## Relationships

| ID | Name/Path | Details |
| --- | --- | --- |
| fund | fund | - |
| person | person | - |
| campus | campus | - |


## Outbound Edges

| ID | Name/Path | Details |
| --- | --- | --- |
| campus-inkinddonation-campus | campus | - |
| fund-inkinddonation-fund | fund | - |
| person-inkinddonation-person | person | - |


## Inbound Edges

| ID | Name/Path | Details |
| --- | --- | --- |
| inkinddonation-organization-in_kind_donations | in_kind_donations | - |
| inkinddonation-person-in_kind_donations | in_kind_donations | - |


## Can Include

| ID | Name/Path | Details |
| --- | --- | --- |
|  | campus | include associated campus |
|  | fund | include associated fund |
|  | person | include associated person |


## Can Order

| ID | Name/Path | Details |
| --- | --- | --- |
|  | created_at | prefix with a hyphen (-created_at) to reverse the order |
|  | received_on | prefix with a hyphen (-received_on) to reverse the order |
|  | updated_at | prefix with a hyphen (-updated_at) to reverse the order |


## Can Query

| ID | Name/Path | Details |
| --- | --- | --- |
|  | campus_id | `Campus` is automatically assigned based on the donor's primary campus. If you pass an explicit value (a relationship reference or `null`), it will override the default. |
|  | created_at | Query on a specific created_at |
|  | fund_id | `Fund` is required. |
|  | received_on | Query on a specific received_on |
|  | updated_at | Query on a specific updated_at |
