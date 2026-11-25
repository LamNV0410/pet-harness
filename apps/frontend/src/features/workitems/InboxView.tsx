// Requirement Inbox: the PO submits a requirement; the BA agent picks it up automatically.
import { workflowContracts as wc } from "@harness/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { call, contracts } from "../../api/client";
import { ago, go, Panel, StatePill } from "../../components/ui";

export function InboxView() {
  const qc = useQueryClient();
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => call(contracts.listProjects),
  });
  const items = useQuery({ queryKey: ["workitems"], queryFn: () => call(wc.listWorkItems) });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("furwatch-api");
  const create = useMutation({
    mutationFn: () => call(wc.createWorkItem, { body: { title, description, projectId } }),
    onSuccess: (d) => {
      setTitle("");
      setDescription("");
      void qc.invalidateQueries({ queryKey: ["workitems"] });
      go(`wi/${d.workItem.id}`);
    },
  });

  return (
    <div className="stack">
      <Panel title="New requirement">
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <label htmlFor="wi-title">Title</label>
          <input
            id="wi-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Remind owners 7 days before a vaccination is due"
            required
            minLength={3}
          />
          <label htmlFor="wi-project">Project</label>
          <select id="wi-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.data?.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label htmlFor="wi-desc">What do you need, and why?</label>
          <textarea
            id="wi-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            required
            placeholder="Describe the behaviour you want, who it is for, and anything that must not change."
          />
          <div className="row-gap">
            <button type="submit" className="primary" disabled={create.isPending}>
              {create.isPending ? "Submitting…" : "Submit to BA agent"}
            </button>
            <span className="sub">
              The BA agent analyzes the code and writes a brief; you approve it at gate 1.
            </span>
          </div>
          {create.isError && <p className="error">{(create.error as Error).message}</p>}
        </form>
      </Panel>
      <Panel title="Work items">
        {!items.data?.workItems.length ? (
          <p className="pad sub">No work items yet.</p>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Project</th>
                  <th>Stage</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.data.workItems.map((w) => (
                  <tr key={w.id} className="clickable" onClick={() => go(`wi/${w.id}`)}>
                    <td className="mono">
                      <a href={`#wi/${w.id}`}>{w.id}</a>
                    </td>
                    <td>{w.title}</td>
                    <td className="mono">{w.projectId}</td>
                    <td className="mono">{w.stage}</td>
                    <td>
                      <StatePill state={w.status} />
                    </td>
                    <td className="sub">{ago(w.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
