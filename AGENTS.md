# puml-lsp Developer Notes

## Run the LSP server

```bash
node src/index.js
# or after npm install -g
puml-lsp
```

## Requirements

- Node.js >= 18
- Java (required for PlantUML validation via `plantuml.jar`)

## Project structure

- `src/index.js` - single entry point, implements LSP server
- `plantuml.jar` - bundled PlantUML binary for syntax validation

## No developer commands

No `test`, `lint`, or `typecheck` scripts defined. No CI config found.

## Validation behavior

The LSP validates:
1. PlantUML syntax via `java -jar plantuml.jar -checkonly -nopreproc`
2. Wiki-style links `[[file.ext Link]]` - checks if target file exists

## Dependencies

- `vscode-languageserver` ^8.1.0
- `vscode-languageserver-textdocument` ^1.0.11