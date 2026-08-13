import { useEffect, useState } from "react";
import { enrollEmployee, listEmployees } from "./api";

export default function EnrollTab() {
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [employeesError, setEmployeesError] = useState(null);

  async function refreshEmployees() {
    try {
      const data = await listEmployees();
      setEmployees(data.employees || []);
      setEmployeesError(null);
    } catch (err) {
      setEmployeesError(err.message);
    }
  }

  useEffect(() => {
    refreshEmployees();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !file) {
      setStatus({ ok: false, message: "Name and image are required." });
      return;
    }

    setSubmitting(true);
    setStatus(null);
    try {
      await enrollEmployee(name.trim(), file);
      setStatus({ ok: true, message: `Enrolled "${name.trim()}" successfully.` });
      setName("");
      setFile(null);
      e.target.reset();
      refreshEmployees();
    } catch (err) {
      setStatus({ ok: false, message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2>Enroll Employee</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label>
            Employee name
            <br />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jane Doe"
            />
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>
            Face photo
            <br />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files[0] || null)}
            />
          </label>
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? "Enrolling..." : "Enroll"}
        </button>
      </form>
      {status && (
        <p style={{ color: status.ok ? "green" : "crimson" }}>{status.message}</p>
      )}

      <h2 style={{ marginTop: 32 }}>Enrolled Employees</h2>
      {employeesError && <p style={{ color: "crimson" }}>{employeesError}</p>}
      {employees.length === 0 && !employeesError ? (
        <p>No employees enrolled yet.</p>
      ) : (
        <table style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "4px 12px 4px 0" }}>
                Name
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "4px 0" }}>
                Enrolled At
              </th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.name}>
                <td style={{ padding: "4px 12px 4px 0" }}>{emp.name}</td>
                <td style={{ padding: "4px 0" }}>{new Date(emp.enrolled_at + "Z").toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
