# PCO Boost: Product Strategy and Pricing Notes

Status: working strategy for discussion and validation. This document records the current product direction; it is not trademark clearance or a commitment to implement every item below.

## Decision in one paragraph

The product can reasonably become a focused Planning Center companion rather than a general church-administration product. The proposed public brand is **PCO Boost**, with the positioning:

> PCO Boost is an independent third-party scheduling workspace for Planning Center Services.

The initial customer is the person who actually builds schedules: a worship pastor, scheduling coordinator, production director, or church administrator. The church or organization can pay, but volunteers are not the current users and should not be the primary billing unit.

## What the product does today

The current workflow is intentionally narrow:

1. Select a Planning Center service type and plan.
2. Review needed team positions.
3. Match people to positions using availability and recent scheduling history.
4. Write the schedule back to Planning Center with one click.

That is enough to sell a scheduler's recurring time savings if the product makes the weekly lineup materially faster, clearer, or more reliable. The product does not need to claim value for every person in the church before charging for the scheduler workflow.

The current repository description reflects this scope in the [README overview](../README.md#overview).

## Positioning and naming

### Recommended name: PCO Boost

Use **PCO Boost** rather than **PCO Booster**.

- `PCO Boost` is shorter, cleaner, and sounds like a product.
- `PCO Booster` is more generic and has additional search and typo-confusion risk with the existing PC Booster software brand ([PC Booster](https://www.pcbooster.com/product/how-it-works.html)).
- PCO is recognizable shorthand in the Planning Center ecosystem. Planning Center has used “PCO” historically, and its integrations directory includes third-party names such as PCO Guru, PCO Ninja, and My PCO Pro ([Planning Center Services history](https://www.planningcenter.com/blog/planning-center-services), [integrations directory](https://www.planningcenter.com/integrations)). This is ecosystem precedent, not blanket permission.

### Describe compatibility; do not imply ownership

Public copy should say:

> PCO Boost — scheduling tools for Planning Center Services.

It should not say or imply:

- that PCO Boost is part of Planning Center;
- that Planning Center sponsors, endorses, or operates PCO Boost;
- that PCO Boost replaces Planning Center;
- that PCO Boost is a generic church-management system.

Planning Center's developer materials explicitly support third-party integrations ([developers](https://www.planningcenter.com/developers)), while its terms and branding guidance protect its intellectual property and prohibit confusing uses or suggestions of sponsorship and endorsement ([Terms of Service](https://www.planningcenter.com/terms), [branding guidelines](https://www.planningcenter.com/logos)).

Use an independent visual identity. Do not use or modify the Planning Center logo, lock it up with the PCO Boost mark, or reproduce the Planning Center look and feel.

Recommended disclaimer:

> PCO Boost is an independent third-party tool and is not affiliated with, sponsored by, or endorsed by Planning Center. Planning Center and Planning Center Services are trademarks of Ministry Centered Technologies, Inc.

### Clearance status

A quick exact-wordmark search on the USPTO system returned no results for `PCOBOOST` or `PCOBOOSTER` as of September 18, 2026. That is only a knockout check. The USPTO says a real clearance search must also review similar marks, related goods and services, alternative spellings, and common-law use ([USPTO trademark search](https://tmsearch.uspto.gov/search/), [federal trademark searching guidance](https://www.uspto.gov/trademarks/search/federal-trademark-searching)). Obtain professional trademark advice before making a substantial public investment.

## Target customer

### Primary user

A person who personally owns the scheduling workflow and feels the pain every week:

- worship pastor;
- worship or production director;
- volunteer scheduling coordinator;
- church administrator who schedules ministry teams.

### Initial ideal customer profile

- Already uses Planning Center Services.
- Has roughly 20–150 active people being scheduled.
- Has one or a few people responsible for building lineups.
- Spends recurring time checking conflicts, fairness, availability, and recent assignments.
- Wants to keep Planning Center as the system of record.

Planning Center Services is already positioned around service planning and volunteer scheduling and reports more than 78,000 churches using it ([Services](https://www.planningcenter.com/services)). The opportunity is therefore an add-on for existing Planning Center customers, not a replacement church-management platform.

## Pricing model: support both Solo and Team

Supporting both an individual path and an organization path is the right compromise. It lets a scheduler start immediately with a personal card, while giving a church a clean way to take ownership later.

| Plan | Who pays | Initial scope | Pricing hypothesis |
| --- | --- | --- | --- |
| Solo | Individual scheduler | One scheduler, one connected church/org, core scheduling workflow | $7–9/month |
| Team | Church or organization | 3–5 scheduler seats, organization-owned subscription and billing | $19/month |
| Growth later | Larger or multi-campus organization | More scheduler seats and differentiated automation/features | $39–49/month initially |

The prices are hypotheses for validation, not market facts. The key rules are:

- Charge for scheduler/admin seats, not every volunteer in Planning Center.
- Keep the core scheduling workflow substantially the same across Solo and Team.
- Make the Team plan about shared access, ownership, continuity, and future collaboration—not arbitrary feature withholding.
- Do not require an accounting or procurement process for a small church to try Solo.
- Do not let personal billing grant any Planning Center permissions beyond what the user authorizes through OAuth.

The Team plan should be the better value when a second or third scheduler joins. The product should not create duplicate subscriptions for the same church merely because several schedulers use separate accounts.

## Upgrade and ownership flow

1. A scheduler starts a Solo trial or subscription with their own payment method.
2. They connect a Planning Center account through the normal authorization flow.
3. They use PCO Boost on the church's authorized Planning Center organization.
4. When another scheduler needs access, the first scheduler invites them or upgrades to Team.
5. The upgrade credits unused Solo time, adds the additional scheduler seats, and allows the church to designate an organization billing owner.
6. If the original purchaser leaves the church, the organization's subscription and authorized data relationship should not be trapped in that person's personal account.

This means subscription ownership and Planning Center data authorization must remain separate concepts. The person paying is not automatically the owner of the church's Planning Center data.

## What could justify higher tiers later

The current value is the scheduler workspace. Higher pricing becomes easier to justify when the product expands into recurring operational work such as:

- automatic decline backfill;
- confirmation and coverage alerts;
- swaps and self-service scheduling;
- calendar-sync blockouts;
- SMS workflows;
- cross-service or multi-campus scheduling;
- audit history and organization-level administration.

Those features should follow demonstrated scheduler demand. They are not prerequisites for charging for the current workflow.

## Validation plan

Before building complex billing or organization administration:

1. Recruit a small set of Planning Center scheduling operators.
2. Offer a paid Solo pilot rather than only a free beta.
3. Measure time to build a lineup, weekly retention, scheduling errors avoided, and willingness to pay.
4. Ask whether the scheduler would pay personally, expense the subscription, or request a Team plan.
5. Convert repeated multi-scheduler usage into the Team plan.

A scheduler declining a $7–9 paid pilot is more useful evidence than a large number of free users. If the product saves meaningful time but nobody will pay even a small amount, the problem is likely positioning, trust, or insufficiently painful workflow—not simply that the price is too high.

## Rebrand and migration implications

The existing application is deeply branded as `worshipadmin.com` across metadata, documentation, OAuth callback instructions, storage namespaces, and configuration. A public rebrand should therefore be treated as a deliberate migration, not just a domain swap.

Recommended migration posture:

- Preserve `worshipadmin.com` as a redirect during the transition.
- Update the Planning Center OAuth callback only after the new domain is configured and tested.
- Keep internal cache keys and repository identifiers stable unless changing them has a concrete benefit.
- Update the public metadata, documentation, billing emails, and legal pages together.
- Do not publicly launch the new name until the independence disclaimer and basic trademark review are in place.
