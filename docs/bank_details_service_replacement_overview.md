# Bank Details — Background and Context

This document gives background for `fcp-sfd-bank-details`. It explains what the service replaces, how it fits into the wider system, and the constraints and principles to follow when writing or reviewing code here. It deliberately stays high level.

---

## 1. Purpose

`fcp-sfd-bank-details` is the FALS-owned replacement for the existing "Bank Details Online" service. That service lets RPA/Defra customers view and change the bank account details used for payments.

The existing service is being replaced because:

- It runs on a platform that is deprecated and no longer patched.
- It is owned by another team, so FALS cannot change it.
- It is spread across several repos and tech stacks that don't follow CDP conventions.

Bringing it in-house lets us manage bank details better and keep the code maintained.

## 2. Scope and constraints

- **D365 Finance and CRM (Dataverse) remain the systems of record.** This service is the integration and orchestration layer. It does not replace the finance or CRM systems.
- **Platform:** CDP, built on the standard CDP Node.js/Hapi backend template. The service holds no state of its own.
- **Callers:** the external frontend, `fcp-sfd-frontend`. Service-to-service auth follows CDP guidance (AWS STS WebIdentity tokens), not shared secrets.
- **No legacy compatibility.** The existing service keeps serving its current consumers until it is retired by its owners. This service has no old API contract to preserve and no migration to build.
- **Sensitive data.** Full bank account details are only held in D365. This service should not persist them, and must never log them.

## 3. What the current service does (high level)

A customer can view their existing bank details, and submit a change to them. A submission goes through these steps:

1. **Check** that the customer is allowed to change details for the business.
2. **Validate** the new bank details with an external bank validation provider (LexisNexis). Outcomes are full match, partial match or no match.
3. **Apply business rules** that limit when a change is allowed (see §4).
4. **Write** the new details to D365 Finance, which returns a result and a supplier hold status.
5. **Create** a Case and an Online Submission Activity in CRM, so a caseworker can review the change.

Steps 4 and 5 are decoupled by messaging, so a D365 outage and a CRM outage can be retried independently. Only a bank account reference and the hold status are passed to CRM, never the full account number or sort code.

Two of the existing building blocks (`ffc-ice-bank` and `ffc-ice-crm`) are public on GitHub, along with a read-only lookup API (`ffc-ice-bank-api`). They are useful references for the D365 and CRM behaviour this service must reproduce.

## 4. Business rules

The current service restricts when a customer can update their details. Business analysis has agreed the following position:

| Rule                                                 | Position                                                                                                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Block updates shortly after a new account is created | **Under investigation.** Caused by a data-sync delay before new records reach D365, not by fraud concerns. A queue-and-retry approach may replace a hard block. |
| Block updates shortly after a previous submission    | **Drop.** No clear rationale, and the D365 hold already covers fraud.                                                                                           |
| Block a second update on the same day                | **Keep.** D365 can't represent two updates on one calendar day, so this is a genuine system constraint.                                                         |
| Limit the number of failed validation attempts       | **Drop as a hard block.** It causes real problems (for example joint accounts failing on name mismatches). Use in-journey guidance or a support route instead.  |

Only the same-day rule is a hard constraint to carry over. Don't reintroduce the dropped rules as hard blocks.

## 5. Delivery phases

**Phase 1: view bank details**

- A signed-in user can view the bank details held for their own business.
- Read-only integration with D365 Finance, using a modern authenticated client.
- A user must only ever see their own organisation's details.
- Service-to-service auth, correlation IDs across both services, and structured logging.

**Phase 2: update bank details**

- A user with the right permission level can update their details.
- Bank validation via LexisNexis, handling full, partial and no-match outcomes.
- Business rules from §4.
- Write to D365, and create the Case and Online Submission Activity in CRM.
- Permission checks enforced in both the frontend and this service.

## 6. Guidance for writing and reviewing code

Follow these when generating or reviewing code in this repo:

- **Validate all inbound data** (requests and messages) with a schema such as Joi. Reject bad input early with a clear error.
- **Make writes idempotent.** Use a stable per-submission key so a retry can't create a duplicate D365 account or CRM Case. Prefer a single, well-defined retry and backoff policy over layered retries.
- **One shared client for D365 and CRM auth and HTTP.** Use MSAL and modern token endpoints, with consistent retry and backoff.
- **Never log or return sensitive data.** That means account numbers, sort codes, tokens and secrets. Mask where display is needed. Treat identifiers (SBI, FRN, CRN) as sensitive in logs.
- **Authorise every request.** Confirm the caller can access the specific organisation requested. Don't rely on the frontend alone.
- **Use correlation IDs** end to end, and CDP's standard logging.
- **Return distinguishable errors**, for example "not found" versus "downstream unavailable". Don't collapse everything into a 500.
- **Make failures visible.** A failed submission must not disappear silently. It needs a route for a person to see and action it.
- **Be careful with dates.** Use a date library, never manual string swapping. Don't parse identifiers out of headers or strings by fixed offsets.
- **Document HTTP APIs** with OpenAPI.
- **Don't hardcode config or secrets.** Use CDP config and secrets.
- **Tests:** unit tests for logic, and contract-style tests for D365 and CRM interactions. Mock external systems.

## 7. Glossary

| Term            | Meaning                                                              |
| --------------- | -------------------------------------------------------------------- |
| SBI             | Single Business Identifier, the identifier for a business            |
| FRN             | Firm Reference Number, the customer's reference used in D365 and CRM |
| CRN             | Customer Reference Number, identifying an individual                 |
| D365            | Dynamics 365 Finance, the system of record for bank account details  |
| CRM / Dataverse | The system caseworkers use to review submissions                     |
| CDP             | Core Delivery Platform, the hosting platform for this service        |
| DAL             | Data Access Layer, the existing API that fronts RPA data sources     |
