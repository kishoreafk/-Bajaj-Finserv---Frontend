import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import handler from '../api/bfhl';
import { buildBfhlResponse, getIdentityConfig } from '../lib/bfhl';
import app from '../server';

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const server = createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const { port } = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

function createMockResponse() {
  let statusCode = 200;
  let jsonBody: unknown;
  const headers = new Map<string, string>();

  const response = {
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(body: unknown) {
      jsonBody = body;
    },
  };

  return {
    response,
    getResult() {
      return {
        statusCode,
        headers,
        jsonBody,
      };
    },
  };
}

test('buildBfhlResponse returns hierarchies for a valid forest', () => {
  const result = buildBfhlResponse(
    { data: ['A->B', 'A->C', 'X->Y', 'Y->Z'] },
    {
      user_id: 'u',
      email_id: 'e',
      college_roll_number: 'r',
    },
  );

  assert.equal(result.status, 200);
  if (result.status !== 200) {
    throw new Error('Expected success response');
  }

  assert.deepEqual(result.body.summary, {
    total_trees: 2,
    total_cycles: 0,
    largest_tree_root: 'X',
  });
  assert.deepEqual(result.body.hierarchies, [
    {
      root: 'A',
      tree: {
        A: {
          B: {},
          C: {},
        },
      },
      depth: 2,
    },
    {
      root: 'X',
      tree: {
        X: {
          Y: {
            Z: {},
          },
        },
      },
      depth: 3,
    },
  ]);
});

test('buildBfhlResponse marks cycle-only components', () => {
  const result = buildBfhlResponse(
    { data: ['X->Y', 'Y->Z', 'Z->X'] },
    getIdentityConfig({}),
  );

  assert.equal(result.status, 200);
  if (result.status !== 200) {
    throw new Error('Expected success response');
  }

  assert.deepEqual(result.body.summary, {
    total_trees: 0,
    total_cycles: 1,
    largest_tree_root: '',
  });
  assert.deepEqual(result.body.hierarchies, [
    {
      root: 'X',
      tree: {},
      has_cycle: true,
    },
  ]);
});

test('buildBfhlResponse collects duplicate edges once', () => {
  const result = buildBfhlResponse(
    { data: ['G->H', 'G->H', 'G->H'] },
    getIdentityConfig({}),
  );

  assert.equal(result.status, 200);
  if (result.status !== 200) {
    throw new Error('Expected success response');
  }

  assert.deepEqual(result.body.duplicate_edges, ['G->H']);
});

test('buildBfhlResponse rejects invalid entries', () => {
  const result = buildBfhlResponse(
    { data: ['hello', 'A->A', 42, 'A->'] },
    getIdentityConfig({}),
  );

  assert.equal(result.status, 200);
  if (result.status !== 200) {
    throw new Error('Expected success response');
  }

  assert.deepEqual(result.body.invalid_entries, ['hello', 'A->A', '42', 'A->']);
});

test('buildBfhlResponse keeps only the first parent for a child', () => {
  const result = buildBfhlResponse(
    { data: ['A->B', 'C->B'] },
    getIdentityConfig({}),
  );

  assert.equal(result.status, 200);
  if (result.status !== 200) {
    throw new Error('Expected success response');
  }

  assert.deepEqual(result.body.hierarchies, [
    {
      root: 'A',
      tree: {
        A: {
          B: {},
        },
      },
      depth: 2,
    },
  ]);
  assert.deepEqual(result.body.summary, {
    total_trees: 1,
    total_cycles: 0,
    largest_tree_root: 'A',
  });
});

test('getIdentityConfig falls back to empty strings', () => {
  assert.deepEqual(getIdentityConfig({}), {
    user_id: '',
    email_id: '',
    college_roll_number: '',
  });
});

test('local express /bfhl handles valid and invalid payloads', async () => {
  await withServer(async (baseUrl) => {
    const okResponse = await fetch(`${baseUrl}/bfhl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: ['A->B', 'B->C'] }),
    });

    assert.equal(okResponse.status, 200);
    const okBody = await okResponse.json();
    assert.deepEqual(okBody.summary, {
      total_trees: 1,
      total_cycles: 0,
      largest_tree_root: 'A',
    });

    const badResponse = await fetch(`${baseUrl}/bfhl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: true }),
    });

    assert.equal(badResponse.status, 400);
    const badBody = await badResponse.json();
    assert.deepEqual(badBody, {
      error: 'Invalid input. Expected json { data: [...] }',
    });
  });
});

test('vercel handler handles POST and rejects other methods', () => {
  const postCapture = createMockResponse();
  handler(
    {
      method: 'POST',
      body: { data: ['A->B'] },
    },
    postCapture.response,
  );

  const postResult = postCapture.getResult();
  assert.equal(postResult.statusCode, 200);
  assert.deepEqual(postResult.jsonBody, {
    user_id: '',
    email_id: '',
    college_roll_number: '',
    hierarchies: [
      {
        root: 'A',
        tree: {
          A: {
            B: {},
          },
        },
        depth: 2,
      },
    ],
    invalid_entries: [],
    duplicate_edges: [],
    summary: {
      total_trees: 1,
      total_cycles: 0,
      largest_tree_root: 'A',
    },
  });

  const getCapture = createMockResponse();
  handler(
    {
      method: 'GET',
    },
    getCapture.response,
  );

  const getResult = getCapture.getResult();
  assert.equal(getResult.statusCode, 405);
  assert.equal(getResult.headers.get('Allow'), 'POST');
  assert.deepEqual(getResult.jsonBody, {
    error: 'Method Not Allowed',
  });
});
