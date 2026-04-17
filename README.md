# puml-lsp

LSP server for PlantUML files with link validation.

## Features

- Syntax validation using PlantUML
- Link validation for `[[file.ext Link]]` references

## Installation

```bash
npm install -g puml-lsp
```

## Usage

```bash
puml-lsp
```

Or run directly:

```bash
node src/index.js
```

## Requirements

- Node.js >= 18
- Java (for PlantUML validation)