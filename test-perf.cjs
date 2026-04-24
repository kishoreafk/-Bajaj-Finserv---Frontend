const http = require('http');

// Build 80 edges across 60 nodes
const nodes = [];
for (let i = 0; i < 6; i++) {
  const p = String.fromCharCode(65 + i);
  for (let j = 0; j < 10; j++) {
    nodes.push(p + j);
  }
}

const edges = [];
for (let i = 0; i < nodes.length - 1; i++) {
  edges.push(nodes[i] + '->' + nodes[i + 1]);
}
for (let i = 0; i < 20; i++) {
  edges.push(nodes[i] + '->' + nodes[i + 10]);
}

const data = JSON.stringify({ data: edges });
const start = Date.now();

const req = http.request(
  {
    hostname: 'localhost',
    port: 3000,
    path: '/bfhl',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  },
  (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      const obj = JSON.parse(body);
      console.log('Status:', res.statusCode);
      console.log('Time ms:', Date.now() - start);
      console.log('Total edges sent:', edges.length);
      console.log('Total nodes involved:', nodes.length);
      console.log('Trees:', obj.summary.total_trees);
      console.log('Cycles:', obj.summary.total_cycles);
    });
  }
);
req.on('error', (e) => console.error('Error:', e.message));
req.write(data);
req.end();
