export interface Conditions {
  heat?: number;
  cool?: number;
  mix?: boolean;
  catalyst?: string;
}

export interface Reaction {
  inputs: Record<string, number>;
  output: number;
  conditions?: Conditions;
}

export interface Effects {
  heals?: Record<string, number>;
  deals?: Record<string, number>;
  conditions?: string[];
}

export interface ChemEntry {
  reactions: Reaction[];
  description?: string;
  overdose?: number;
  effects?: Effects;
}

export interface ChemDB {
  [name: string]: ChemEntry;
}

export interface TreeNode {
  name: string;
  amount: number;
  depth: number;
  children: TreeNode[];
  synthesized: boolean;
  conditions: Conditions | null;
}

export function buildTree(
  name: string,
  amt: number,
  depth: number,
  visited: Set<string>,
  chems: ChemDB,
): TreeNode | null {
  if (visited.has(name)) return null;
  const v2 = new Set(visited);
  v2.add(name);
  const rx = chems[name]?.reactions[0] ?? null;
  const node: TreeNode = {
    name,
    amount: amt,
    depth,
    children: [],
    synthesized: !!rx,
    conditions: rx ? (rx.conditions ?? null) : null,
  };
  if (!rx) return node;
  const scale = amt / rx.output;
  for (const [childName, childRatio] of Object.entries(rx.inputs)) {
    const child = buildTree(
      childName,
      parseFloat((childRatio * scale).toFixed(3)),
      depth + 1,
      v2,
      chems,
    );
    if (child) node.children.push(child);
  }
  return node;
}

export function collectBases(node: TreeNode, acc: Record<string, number>): void {
  if (!node.synthesized) {
    acc[node.name] = (acc[node.name] || 0) + node.amount;
  }
  node.children.forEach((c) => collectBases(c, acc));
}

export function collectSteps(node: TreeNode, steps: TreeNode[]): void {
  if (node.synthesized) steps.push(node);
  node.children.forEach((c) => collectSteps(c, steps));
}
