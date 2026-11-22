# Wyrmforge V2 engine boundaries

Before implementing a roadmap item, read the current-focus entry and its
dependencies in [Delivery Tasks](docs/DELIVERY-TASKS.md). A later integration
item does not change the current engine's scope or its acceptance criteria.
If the next numbered item belongs to another engine, complete the current
engine's scoped acceptance and explicit handoff first.

Use [Engine ownership and handoffs](docs/ENGINE-BOUNDARIES.md) to identify
the owner of each state change. Keep feature-specific rules out of shared
engines. Play Hunt composes public contracts. If an integration needs a
missing contract, record the dependency in GitHub and implement it in its
owning engine when in scope.

Keep pending device checks and open dependencies visible. Report automated,
desktop and real-device evidence separately.
