# REGISTRY MODULE

## OVERVIEW

Tool and skill discovery layer. `BaseRegistry<T>` is a generic abstract base providing CRUD, frontmatter parsing, and LRU+TTL caching. `ToolRegistry` and `SkillRegistry` are thin concrete subclasses that wire entity-specific behavior (file extensions, error types, item construction).

Registries are passive stores. File system watchers in `src/watchers/` drive automatic re-discovery on change.

## STRUCTURE

```
registry/
├── BaseRegistry.ts    # abstract BaseRegistry<T extends { name: string }>
├── ToolRegistry.ts    # extends BaseRegistry<Tool>, implements IToolRegistry
└── SkillRegistry.ts   # extends BaseRegistry<Skill>
```

## WHERE TO LOOK

| Task                                  | Location                                |
| ------------------------------------- | --------------------------------------- |
| Add a new entity registry             | Subclass `BaseRegistry<T>`, implement abstract hooks |
| Frontmatter parsing logic             | `BaseRegistry._parseFrontmatter` (YAML between `---` delimiters) |
| Tool name allowlist contract          | `IToolRegistry` (consumed by skill `allowed_tools`) |
| Cache tuning                          | `src/cache/DiscoveryCache.ts` (TTL 300s, max 100) |
| Auto-rediscovery triggers             | `src/watchers/` (separate concern)      |
| Forbidden coupling rules              | `.sentrux/rules.toml`                    |

## CONVENTIONS

- **Abstract hooks** subclasses MUST implement: `_fileExtensions`, `_entityName`, `_shouldSkipFile`, `_parseFrontmatter`, `_buildItem`, `_createInvalidError`, `_createDuplicateError`, `_createNotFoundError`.
- **Storage** `_items: Map<string, T>` keyed by entity `name` string, NOT branded IDs. Names come from frontmatter, not file paths.
- **Cache** all discovery passes through `DiscoveryCache`. Invalidate on add/remove, not on read.
- **Errors** every failure path throws a typed `SequentialThinkingError` subclass via the `_create*Error` hooks. Never throw raw `Error`.
- **Removal** `SkillRegistry` removes by id only. The legacy `removeSkillByName()` shim has been deleted, callers must resolve id first.
- **Async-first** all discovery and IO is async. No sync `fs` calls outside startup.

## NOTES

- **Forbidden boundary** registries MUST NOT import from `src/core/HistoryManager.ts` or any `core/` runtime state. Discovery is independent of thinking sessions. Enforced by `.sentrux/rules.toml`.
- **Watcher separation** keep file-watching logic in `src/watchers/`. Registries expose mutation methods, watchers call them. Don't embed `chokidar` here.
- **Generic constraint** `T extends { name: string }` is the only contract. Don't widen it, downstream identity assumes name uniqueness inside one registry.
- **Frontmatter only** body content of skill/tool markdown is opaque to the registry. Parsing the body belongs to whoever consumes the item.
- **Concrete `ToolRegistry` type** the DI registry exposes `ToolRegistry: ToolRegistry` (concrete), not the interface, because `IToolRegistry` only covers the allowlist subset.
