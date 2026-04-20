const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const LSP_PATH = path.join(__dirname, '..', 'src', 'index.js');

function createLSPClient() {
  let messageId = 0;
  let proc;
  const pending = new Map();
  const notifications = [];
  let stdoutBuffer = '';

  const readMessage = (data) => {
    stdoutBuffer += data.toString();
    const messages = [];
    while (stdoutBuffer.includes('\r\n\r\n') || stdoutBuffer.includes('\n\n')) {
      const delimiter = stdoutBuffer.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
      const idx = stdoutBuffer.indexOf(delimiter);
      const header = stdoutBuffer.slice(0, idx);
      const bodyStart = idx + delimiter.length;
      
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        stdoutBuffer = stdoutBuffer.slice(bodyStart);
        continue;
      }
      
      const length = parseInt(lengthMatch[1], 10);
      if (stdoutBuffer.length < bodyStart + length) break;
      
      const body = stdoutBuffer.slice(bodyStart, bodyStart + length);
      stdoutBuffer = stdoutBuffer.slice(bodyStart + length);
      
      try {
        const msg = JSON.parse(body);
        messages.push(msg);
      } catch {}
    }
    return messages;
  };

  return {
    start() {
      return new Promise((resolve, reject) => {
        proc = spawn('bash', ['-c', `node ${LSP_PATH} --stdio`], { 
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: path.join(__dirname, '..')
        });
        
        proc.stderr.on('data', () => {});
        
        proc.stdout.on('data', (data) => {
          for (const msg of readMessage(data)) {
            if (msg.id !== undefined && pending.has(msg.id)) {
              pending.get(msg.id).resolve(msg);
            } else if (msg.method === 'textDocument/publishDiagnostics') {
              notifications.push(msg);
            }
          }
        });

        setTimeout(() => resolve(), 200);
      });
    },

    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++messageId;
        const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
        const body = Buffer.byteLength(msg, 'utf8');
        const wire = `Content-Length: ${body}\r\n\r\n${msg}`;
        
        pending.set(id, { resolve, reject });
        proc.stdin.write(wire);
      });
    },

    notify(method, params = {}) {
      const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
      const body = Buffer.byteLength(msg, 'utf8');
      const wire = `Content-Length: ${body}\r\n\r\n${msg}`;
      proc.stdin.write(wire);
    },

    async initialize(rootPath) {
      const result = await this.send('initialize', { 
        processId: 1,
        rootUri: 'file://' + path.join(__dirname, '..', rootPath),
        capabilities: {}
      });
      return result;
    },

    async openDocument(fileName, content) {
      const filePath = path.join(__dirname, '..', fileName);
      fs.writeFileSync(filePath, content);
      this.notify('textDocument/didOpen', {
        textDocument: {
          uri: `file://${filePath}`,
          languageId: 'plantuml',
          version: 1,
          text: content
        }
      });
    },

    getDiagnostics() {
      return notifications.filter(n => n.method === 'textDocument/publishDiagnostics');
    },

    clearNotifications() {
      notifications.length = 0;
    },

    kill() {
      if (proc) proc.kill();
    }
  };
}

describe('LSP Server', () => {
  let client;

  afterEach(() => {
    if (client) client.kill();
  });

  it('should return no diagnostics for valid PUML', async () => {
    client = createLSPClient();
    await client.start();
    await client.initialize('.');
    
    const content = '@startuml\nactor User\nparticipant System\nUser -> System: Request\n@enduml';
    await client.openDocument('valid.puml', content);
    
    await new Promise(r => setTimeout(r, 2000));
    
    const diags = client.getDiagnostics();
    const fileDiags = diags.find(d => d.params.uri.includes('valid.puml'));
    
    assert.strictEqual(fileDiags?.params.diagnostics?.length || 0, 0);
  });

  it('should return error diagnostic for invalid PUML', async () => {
    client = createLSPClient();
    await client.start();
    await client.initialize('.');
    
    const content = '@startuml\nnote over User\nmissing closing\n@enduml';
    await client.openDocument('invalid.puml', content);
    
    await new Promise(r => setTimeout(r, 2000));
    
    const diags = client.getDiagnostics();
    const fileDiags = diags.find(d => d.params.uri.includes('invalid.puml'));
    
    assert.ok(fileDiags?.params.diagnostics?.length > 0, 'Should have diagnostic errors');
  });

  it('should return error for missing wiki link target', async () => {
    client = createLSPClient();
    await client.start();
    await client.initialize('.');
    
    const content = '@startuml\n[[missing.puml Missing Link]]\n@enduml';
    await client.openDocument('links.puml', content);
    
    await new Promise(r => setTimeout(r, 1500));
    
    const diags = client.getDiagnostics();
    const fileDiags = diags.find(d => d.params.uri.includes('links.puml'));
    
    assert.ok(fileDiags?.params.diagnostics?.length > 0);
    assert.ok(fileDiags.params.diagnostics[0].message.includes('missing.puml'));
  });

  it('should return no error for existing wiki link', async () => {
    client = createLSPClient();
    await client.start();
    await client.initialize('.');
    
    const targetPath = path.join(__dirname, '..', 'targetexists.puml');
    fs.writeFileSync(targetPath, '@startuml\nnode X\n@enduml');
    
    await new Promise(r => setTimeout(r, 50));
    
    const content = '@startuml\n[[targetexists.puml Exists]]\n@enduml';
    await client.openDocument('validlinks.puml', content);
    
    await new Promise(r => setTimeout(r, 1500));
    
    const allDiags = client.getDiagnostics();
    const linkDiags = allDiags.filter(d => d.params.uri.includes('targetexists') && d.params.diagnostics?.length > 0);
    
    assert.strictEqual(linkDiags.length, 0);
  });
});