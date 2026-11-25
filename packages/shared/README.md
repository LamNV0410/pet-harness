# packages/shared — contracts between Harness backend and frontend

**Owner:** BE + FE, through the contract process. **Status:** empty. The contract format and language are undecided (D4, D10).

**Allowed:** API request/response types, error shapes, event/message schemas, validation schemas, shared enums and constants, interfaces. Small pure helpers that only operate on these types.

**Not allowed:** framework code, I/O, network or database access, UI, application business logic, and any import from `apps/*`.

**Changing anything here:** follow `docs/standards/contracts.md` §2 (contract process).
