import type { SubagentNode } from "@prime-workbench/protocol";

export function SubagentBoard({
  tree,
  onObserve,
}: {
  tree: SubagentNode | null;
  onObserve?: (id: string) => void;
}) {
  return (
    <div className="panel">
      <div className="panel-title">
        <span>Subagent Board</span>
        <span style={{ fontWeight: 400 }}>RLM tree</span>
      </div>
      <div className="panel-body">
        {!tree ? (
          <div className="empty" style={{ margin: "20px 0" }}>
            No subagents yet. Ask the agent to spawn research / parallel work.
          </div>
        ) : (
          <NodeView node={tree} onObserve={onObserve} />
        )}
      </div>
    </div>
  );
}

function NodeView({ node, onObserve }: { node: SubagentNode; onObserve?: (id: string) => void }) {
  return (
    <div
      className="sa-node"
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onObserve?.(node.id);
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div className="name">{node.name}</div>
        <span className={`status-pill ${node.status}`}>{node.status}</span>
      </div>
      <div className="meta">
        {node.role ? `${node.role} · ` : ""}
        depth {node.depth}
        {node.summary ? ` · ${node.summary}` : ""}
      </div>
      {node.children && node.children.length > 0 && (
        <div className="sa-children">
          {node.children.map((c) => (
            <NodeView key={c.id} node={c} onObserve={onObserve} />
          ))}
        </div>
      )}
    </div>
  );
}
