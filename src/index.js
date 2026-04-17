const { createConnection } = require('vscode-languageserver');
const { TextDocument } = require('vscode-languageserver-textdocument');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const connection = createConnection(process.stdin, process.stdout);
const documents = new Map();
let workspaceRoot = null;

const PLANTUML_JAR = path.join(__dirname, '..', 'plantuml.jar');

function validatePUML(textDocument) {
  return new Promise((resolve) => {
    const diagnostics = [];
    const uri = textDocument.uri;
    const filePath = uriToFilePath(uri);
    const content = documents.get(uri);

    if (!content) {
      resolve(diagnostics);
      return;
    }

    const relativeRefs = [];
    const refRegex = /\[\[([^\s|]+)(?:\s+|\|)([^\]]+)\]\]/g;
    let match;
    while ((match = refRegex.exec(content)) !== null) {
      relativeRefs.push({ path: match[1].trim(), line: content.substring(0, match.index).split('\n').length });
    }

    const baseDir = path.dirname(filePath);
    for (const ref of relativeRefs) {
      const refPath = path.join(baseDir, ref.path);
      if (!fs.existsSync(refPath)) {
        diagnostics.push({
          severity: 1,
          range: {
            start: { line: ref.line - 1, character: 0 },
            end: { line: ref.line - 1, character: 10 }
          },
          message: `File not found: ${ref.path}`
        });
      }
    }

    const args = ['-jar', PLANTUML_JAR, '-checkonly', '-nopreproc', filePath];
    const proc = spawn('java', args, { timeout: 30000 });

    let stderr = '';
    let stdout = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      if (code !== 0) {
        const errorOutput = stdout + stderr;
        const lineMatch = errorOutput.match(/line\s+(\d+)/i);
        const line = lineMatch ? parseInt(lineMatch[1], 10) - 1 : 0;

        const cleanMsg = errorOutput.split('\n')[0].trim();

        diagnostics.push({
          severity: 1,
          range: {
            start: { line, character: 0 },
            end: { line, character: 10 }
          },
          message: cleanMsg || 'PlantUML syntax error'
        });
      }
      resolve(diagnostics);
    });

    proc.on('error', (err) => {
      diagnostics.push({
        severity: 1,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: `Failed to run PlantUML: ${err.message}`
      });
      resolve(diagnostics);
    });
  });
}

function uriToFilePath(uri) {
  if (uri.startsWith('file://')) {
    return decodeURIComponent(uri.replace('file://', ''));
  }
  return uri;
}

connection.onInitialize((params) => {
  workspaceRoot = params.rootUri;
  return {
    capabilities: {
      textDocumentSync: 1,
      diagnosticProvider: { identifier: 'puml', reset: true }
    }
  };
});

connection.onDidChangeConfiguration(() => {});

connection.onDidOpenTextDocument((params) => {
  const textDocument = TextDocument.create(
    params.textDocument.uri,
    'plantuml',
    params.textDocument.version,
    params.textDocument.text
  );
  documents.set(params.textDocument.uri, textDocument.getText());
  validatePUML(textDocument).then((diagnostics) => {
    connection.sendDiagnostics({ uri: params.textDocument.uri, diagnostics });
  });
});

connection.onDidChangeTextDocument((params) => {
  const uri = params.textDocument.uri;
  documents.set(uri, params.contentChanges[0].text);
  const textDocument = TextDocument.create(uri, 'plantuml', params.textDocument.version, params.contentChanges[0].text);
  validatePUML(textDocument).then((diagnostics) => {
    connection.sendDiagnostics({ uri, diagnostics });
  });
});

connection.onDidCloseTextDocument((params) => {
  documents.delete(params.textDocument.uri);
});

connection.listen();