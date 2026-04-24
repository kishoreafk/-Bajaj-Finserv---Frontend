export interface IdentityConfig {
  user_id: string;
  email_id: string;
  college_roll_number: string;
}

export interface HierarchyTree {
  [key: string]: HierarchyTree;
}

export interface TreeHierarchy {
  root: string;
  tree: HierarchyTree;
  depth: number;
  has_cycle?: false;
}

export interface CycleHierarchy {
  root: string;
  tree: Record<string, never>;
  has_cycle: true;
}

export type Hierarchy = TreeHierarchy | CycleHierarchy;

export interface BfhlSuccessBody {
  user_id: string;
  email_id: string;
  college_roll_number: string;
  hierarchies: Hierarchy[];
  invalid_entries: string[];
  duplicate_edges: string[];
  summary: {
    total_trees: number;
    total_cycles: number;
    largest_tree_root: string;
  };
}

export interface BfhlErrorBody {
  error: string;
}

export type BfhlResponse =
  | {
      status: 200;
      body: BfhlSuccessBody;
    }
  | {
      status: 400;
      body: BfhlErrorBody;
    };

const INVALID_INPUT_ERROR = 'Invalid input. Expected json { data: [...] }';
const INPUT_TOO_LARGE_ERROR = 'Input array too large. Max 1000 entries allowed.';
const MAX_DATA_ITEMS = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getIdentityConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): IdentityConfig {
  return {
    user_id: env.USER_ID ?? '',
    email_id: env.EMAIL_ID ?? '',
    college_roll_number: env.COLLEGE_ROLL_NUMBER ?? '',
  };
}

export function buildBfhlResponse(input: unknown, identity: IdentityConfig): BfhlResponse {
  if (!isRecord(input) || !Array.isArray(input.data)) {
    return {
      status: 400,
      body: { error: INVALID_INPUT_ERROR },
    };
  }

  const { data } = input;

  if (data.length > MAX_DATA_ITEMS) {
    return {
      status: 400,
      body: { error: INPUT_TOO_LARGE_ERROR },
    };
  }

  const invalid_entries: string[] = [];
  const duplicate_edges_set = new Set<string>();
  const accepted_edges: Array<[string, string]> = [];
  const seen_edges = new Set<string>();
  const child_parent_map = new Map<string, string>();

  for (const rawEntry of data) {
    if (typeof rawEntry !== 'string') {
      invalid_entries.push(String(rawEntry));
      continue;
    }

    const entry = rawEntry.trim();

    if (!/^[A-Z]->[A-Z]$/.test(entry)) {
      invalid_entries.push(entry);
      continue;
    }

    if (entry[0] === entry[3]) {
      invalid_entries.push(entry);
      continue;
    }

    if (seen_edges.has(entry)) {
      duplicate_edges_set.add(entry);
      continue;
    }

    seen_edges.add(entry);

    const parent = entry[0];
    const child = entry[3];

    if (child_parent_map.has(child)) {
      continue;
    }

    child_parent_map.set(child, parent);
    accepted_edges.push([parent, child]);
  }

  const adjacency_list = new Map<string, string[]>();
  const undirected_adj = new Map<string, string[]>();
  const nodes = new Set<string>();

  for (const [parent, child] of accepted_edges) {
    nodes.add(parent);
    nodes.add(child);

    if (!adjacency_list.has(parent)) adjacency_list.set(parent, []);
    adjacency_list.get(parent)!.push(child);
    if (!adjacency_list.has(child)) adjacency_list.set(child, []);

    if (!undirected_adj.has(parent)) undirected_adj.set(parent, []);
    if (!undirected_adj.has(child)) undirected_adj.set(child, []);
    undirected_adj.get(parent)!.push(child);
    undirected_adj.get(child)!.push(parent);
  }

  const components: Set<string>[] = [];
  const visited = new Set<string>();

  for (const node of nodes) {
    if (visited.has(node)) {
      continue;
    }

    const component = new Set<string>();
    const queue = [node];
    visited.add(node);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.add(current);

      const neighbors = undirected_adj.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    components.push(component);
  }

  const hierarchies: Hierarchy[] = [];
  let total_trees = 0;
  let total_cycles = 0;
  let largest_tree_root: string | null = null;
  let largest_tree_depth = 0;

  for (const component of components) {
    const roots: string[] = [];

    for (const node of component) {
      if (!child_parent_map.has(node)) {
        roots.push(node);
      }
    }

    if (roots.length === 0) {
      total_cycles++;
      const cycleRoot = Array.from(component).sort()[0];
      hierarchies.push({
        root: cycleRoot,
        tree: {},
        has_cycle: true,
      });
      continue;
    }

    total_trees++;
    const root = roots[0];

    const buildTree = (node: string): HierarchyTree => {
      const children = adjacency_list.get(node) || [];
      const tree: HierarchyTree = {};

      for (const child of children) {
        tree[child] = buildTree(child);
      }

      return tree;
    };

    const getDepth = (node: string): number => {
      const children = adjacency_list.get(node) || [];
      if (children.length === 0) {
        return 1;
      }

      return 1 + Math.max(...children.map((child) => getDepth(child)));
    };

    const depth = getDepth(root);
    hierarchies.push({
      root,
      tree: { [root]: buildTree(root) },
      depth,
    });

    if (depth > largest_tree_depth) {
      largest_tree_depth = depth;
      largest_tree_root = root;
    } else if (depth === largest_tree_depth && largest_tree_root !== null && root < largest_tree_root) {
      largest_tree_root = root;
    }
  }

  return {
    status: 200,
    body: {
      ...identity,
      hierarchies,
      invalid_entries,
      duplicate_edges: Array.from(duplicate_edges_set),
      summary: {
        total_trees,
        total_cycles,
        largest_tree_root: largest_tree_root || '',
      },
    },
  };
}
