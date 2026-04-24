import { buildBfhlResponse, getIdentityConfig } from '../lib/bfhl';

type NodeRequest = {
  method?: string;
  body?: unknown;
};

type NodeResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): NodeResponse;
  json(body: unknown): void;
};

export default function handler(req: NodeRequest, res: NodeResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const result = buildBfhlResponse(req.body, getIdentityConfig());
  return res.status(result.status).json(result.body);
}
