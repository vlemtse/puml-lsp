#!/usr/bin/env node
'use strict';

const {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  DiagnosticSeverity,
  TextDocumentSyncKind
} = require('vscode-languageserver/node');

const { TextDocument } = require('vscode-languageserver-textdocument');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

const PLANTUML_JAR = path.join(__dirname, '..', 'plantuml.jar');
let validationTimeout = null;

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental
  }
}));

connection.onInitialized(() => {
  connection.console.log('PlantUML Language Server initialized');
});

documents.onDidOpen((event) => {
  connection.console.log('Document opened: ' + event.document.uri);
  if (validationTimeout) clearTimeout(validationTimeout);
  validationTimeout = setTimeout(() => {
    validateTextDocument(event.document);
  }, 200);
});

documents.onDidChangeContent((change) => {
  if (validationTimeout) clearTimeout(validationTimeout);
  validationTimeout = setTimeout(() => {
    validateTextDocument(change.document);
  }, 200);
});

documents.onDidClose((event) => {
  connection.sendDiagnostics({
    uri: event.document.uri,
    diagnostics: []
  });
});

async function validateTextDocument(textDocument) {
  const uri = textDocument.uri;
  const filePath = uriToFilePath(uri);
  const content = textDocument.getText();
  const diagnostics = [];

  const relativeRefs = [];
  const refRegex = /\[\[([^\s|]+)(?:\s+|\|)([^\]]+)\]\]/g;
  let match;
  while ((match = refRegex.exec(content)) !== null) {
    relativeRefs.push({
      path: match[1].trim(),
      line: content.substring(0, match.index).split('\n').length
    });
  }

  const baseDir = path.dirname(filePath);
  for (const ref of relativeRefs) {
    const refPath = path.join(baseDir, ref.path);
    if (!fs.existsSync(refPath)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: ref.line - 1, character: 0 },
          end: { line: ref.line - 1, character: 10 }
        },
        message: `File not found: ${ref.path}`
      });
    }
  }

  try {
    const args = ['-jar', PLANTUML_JAR, '-checkonly', '-nopreproc', filePath];
    const result = await new Promise((resolve, reject) => {
      const proc = spawn('java', args, { timeout: 30000 });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => { stdout += d; });
      proc.stderr.on('data', d => { stderr += d; });
      proc.on('close', code => resolve({ code, stdout, stderr }));
      proc.on('error', err => reject(err));
    });

    if (result.code !== 0) {
      const errorOutput = result.stdout + result.stderr;
      const lineMatch = errorOutput.match(/line\s+(\d+)/i);
      const line = lineMatch ? parseInt(lineMatch[1], 10) - 1 : 0;

      const errorLines = errorOutput.split('\n').filter(l => l.trim().length > 0);
      let cleanMsg = 'PlantUML syntax error';
      for (const l of errorLines) {
        const lower = l.toLowerCase();
        if (lower.includes('error') || lower.includes('syntax') || lower.includes('exception')) {
          cleanMsg = l.trim();
          break;
        }
      }
      if (cleanMsg === 'PlantUML syntax error' && errorLines.length > 0) {
        cleanMsg = errorLines[0].trim();
      }

      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line, character: 0 },
          end: { line, character: 10 }
        },
        message: cleanMsg
      });
    }
  } catch (err) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
      message: `Failed to run PlantUML: ${err.message}`
    });
  }

  connection.sendDiagnostics({ uri, diagnostics });
}

function uriToFilePath(uri) {
  if (uri.startsWith('file://')) {
    return decodeURIComponent(uri.replace('file://', ''));
  }
  return uri;
}

documents.listen(connection);
connection.listen();