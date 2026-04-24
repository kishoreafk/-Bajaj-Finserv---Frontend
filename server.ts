import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import path from 'path';

const app = express();

// Security headers — relaxed CSP in dev for Vite HMR inline scripts + WS
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'"],
    },
  },
}));

// CORS - controlled but not strict (allows evaluator tools)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, curl, mobile apps, evaluators)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

// Body parsing with size limit
app.use(express.json({ limit: '100kb' }));

// Timeout protection
app.use((req, res, next) => {
  res.setTimeout(5000, () => {
    res.status(503).json({ error: 'Request timeout' });
  });
  next();
});

// Rate limiting for /bfhl
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests, try again later.',
  },
});
app.use('/bfhl', limiter);

app.post('/bfhl', (req, res) => {
  try {
    const { data } = req.body;
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Invalid input. Expected json { data: [...] }' });
    }

    // Prevent large payload abuse
    if (data.length > 1000) {
      return res.status(400).json({ error: 'Input array too large. Max 1000 entries allowed.' });
    }

    const invalid_entries: string[] = [];
    const duplicate_edges_set = new Set<string>();
    const accepted_edges: [string, string][] = [];

    const seen_edges = new Set<string>();
    const child_parent_map = new Map<string, string>();

    // 1. Process entries
    for (const rawEntry of data) {
        if (typeof rawEntry !== 'string') {
            invalid_entries.push(String(rawEntry));
            continue;
        }

        const entry = rawEntry.trim();

        // Validate format X->Y
        if (!/^[A-Z]->[A-Z]$/.test(entry)) {
            invalid_entries.push(entry);
            continue;
        }

        // Check self-loop
        if (entry[0] === entry[3]) {
            invalid_entries.push(entry);
            continue;
        }

        // Check duplicate
        if (seen_edges.has(entry)) {
            duplicate_edges_set.add(entry);
            continue;
        }

        seen_edges.add(entry);

        const parent = entry[0];
        const child = entry[3];

        // Diamond/multi-parent - first encountered wins
        if (child_parent_map.has(child)) {
            continue;
        }

        child_parent_map.set(child, parent);
        accepted_edges.push([parent, child]);
    }

    // 2. Build adjacency for components and tree building
    const adjacency_list = new Map<string, string[]>();
    const undirected_adj = new Map<string, string[]>();
    const nodes = new Set<string>();

    for (const [p, c] of accepted_edges) {
        nodes.add(p);
        nodes.add(c);
        
        if (!adjacency_list.has(p)) adjacency_list.set(p, []);
        adjacency_list.get(p)!.push(c);
        if (!adjacency_list.has(c)) adjacency_list.set(c, []);

        if (!undirected_adj.has(p)) undirected_adj.set(p, []);
        if (!undirected_adj.has(c)) undirected_adj.set(c, []);
        undirected_adj.get(p)!.push(c);
        undirected_adj.get(c)!.push(p);
    }

    // Find weakly connected components
    const components: Set<string>[] = [];
    const visited = new Set<string>();

    for (const node of nodes) {
        if (!visited.has(node)) {
            const comp = new Set<string>();
            const queue = [node];
            visited.add(node);
            while (queue.length > 0) {
                const curr = queue.shift()!;
                comp.add(curr);
                const neighbors = undirected_adj.get(curr) || [];
                for (const neighbor of neighbors) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        queue.push(neighbor);
                    }
                }
            }
            components.push(comp);
        }
    }

    const hierarchies = [];
    let total_trees = 0;
    let total_cycles = 0;
    let largest_tree_root: string | null = null;
    let largest_tree_depth = 0;

    for (const comp of components) {
        const roots = [];
        for (const node of comp) {
            if (!child_parent_map.has(node)) {
                roots.push(node);
            }
        }

        if (roots.length === 0) {
            // cycle
            total_cycles++;
            const sortedComp = Array.from(comp).sort();
            const cycleRoot = sortedComp[0];
            hierarchies.push({
                root: cycleRoot,
                tree: {},
                has_cycle: true
            });
        } else {
            // tree
            total_trees++;
            const root = roots[0];

            const buildTree = (n: string): any => {
                const children = adjacency_list.get(n) || [];
                const obj: any = {};
                for (const c of children) {
                    obj[c] = buildTree(c);
                }
                return obj;
            };

            const getDepth = (n: string): number => {
                const children = adjacency_list.get(n) || [];
                if (children.length === 0) return 1;
                return 1 + Math.max(...children.map(c => getDepth(c)));
            };

            const depth = getDepth(root);
            hierarchies.push({
                root: root,
                tree: { [root]: buildTree(root) },
                depth: depth
            });

            if (depth > largest_tree_depth) {
                largest_tree_depth = depth;
                largest_tree_root = root;
            } else if (depth === largest_tree_depth && largest_tree_root !== null) {
                if (root < largest_tree_root) {
                    largest_tree_root = root;
                }
            }
        }
    }

    const summary = {
        total_trees,
        total_cycles,
        largest_tree_root: largest_tree_root || ''
    };

    const responsePayload = {
        user_id: process.env.USER_ID || '',
        email_id: process.env.EMAIL_ID || '',
        college_roll_number: process.env.COLLEGE_ROLL_NUMBER || '',
        hierarchies,
        invalid_entries,
        duplicate_edges: Array.from(duplicate_edges_set),
        summary
    };

    return res.json(responsePayload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
      root: process.cwd()
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0' as any, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.VERCEL !== '1') {
  startServer();
}

export default app;
