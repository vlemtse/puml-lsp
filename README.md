# puml-lsp

LSP server for PlantUML files with link validation.

## Features

- Syntax validation using PlantUML
- Link validation for `[[file.ext Link]]` references

## Requirements

- Node.js >= 18
- Java (for PlantUML validation)

## Installation

```bash
npm install -g puml-lsp
```

## Usage (CLI)

```bash
puml-lsp
```

Or run directly:

```bash
node src/index.js
```

## Usage (VS Code)

### Option 1: Global install

```bash
npm install -g puml-lsp
```

Add to VS Code settings:

```json
{
  "plantuml.server": "puml-lsp"
}
```

### Option 2: Local install (recommended for development)

```bash
npm install --save-dev puml-lsp
```

Add to VS Code settings (Local LSP extension required):

```json
{
  "localLsp.servers": {
    "puml": {
      "command": "node",
      "args": ["${workspaceFolder}/node_modules/puml-lsp/src/index.js"],
      "languages": ["plantuml"],
      "configuration": {
        "trace": false
      }
    }
  }
}
```

Or use the `Local - Languages Server` extension from the VS Code marketplace.

## Troubleshooting

If LSP doesn't connect:

1. Make sure Java is installed: `java -version`
2. For global install, verify the command is in PATH: `which puml-lsp`
3. For local install, verify the path to `src/index.js` is correct
4. Check VS Code output panel for "PlantUML Language Server initialized" message