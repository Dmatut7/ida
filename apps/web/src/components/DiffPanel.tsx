import type { DiffFile } from "@prime-workbench/protocol";

export function DiffPanel({ files }: { files: DiffFile[] }) {
  return (
    <div className="panel" style={{ borderBottom: "none" }}>
      <div className="panel-title">
        <span>Diff / Review</span>
        <span style={{ fontWeight: 400 }}>{files.length} files</span>
      </div>
      <div className="panel-body">
        {files.length === 0 ? (
          <div className="empty" style={{ margin: "20px 0" }}>
            Proposed patches will appear here.
          </div>
        ) : (
          files.map((f) => (
            <div className="diff-file" key={f.path}>
              <div className="diff-path">
                {f.status} · {f.path}
              </div>
              <pre className="diff-patch">{f.patch}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
