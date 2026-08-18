import { useEffect, useRef, useState } from "react";
import { deleteEmployee, enrollEmployee, listEmployees } from "./api";

export default function EnrollTab() {
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [employeesError, setEmployeesError] = useState(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [deletingName, setDeletingName] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

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

  useEffect(() => {
    return () => {
      stopCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setPickedFile(newFile) {
    setFile(newFile);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return newFile ? URL.createObjectURL(newFile) : null;
    });
  }

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (err) {
      setCameraError(`Could not access webcam: ${err.message}`);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const capturedFile = new File([blob], "capture.jpg", { type: "image/jpeg" });
        setPickedFile(capturedFile);
        stopCamera();
      },
      "image/jpeg",
      0.9
    );
  }

  async function handleDelete(empName) {
    if (!window.confirm(`Remove "${empName}" from enrolled employees?`)) return;

    setDeletingName(empName);
    setStatus(null);
    try {
      await deleteEmployee(empName);
      setStatus({ ok: true, message: `Removed "${empName}".` });
      refreshEmployees();
    } catch (err) {
      setStatus({ ok: false, message: err.message });
    } finally {
      setDeletingName(null);
    }
  }

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
      setPickedFile(null);
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
              onChange={(e) => setPickedFile(e.target.files[0] || null)}
            />
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          {!cameraOn ? (
            <button type="button" onClick={startCamera}>
              Use Camera
            </button>
          ) : (
            <button type="button" onClick={stopCamera}>
              Cancel Camera
            </button>
          )}
          {cameraError && <p style={{ color: "crimson" }}>{cameraError}</p>}

          <div style={{ marginTop: 8, display: cameraOn ? "block" : "none" }}>
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: 320, height: 240, background: "#000" }}
            />
            <br />
            <button type="button" onClick={capturePhoto} style={{ marginTop: 8 }}>
              Capture Photo
            </button>
          </div>

          {previewUrl && !cameraOn && (
            <div style={{ marginTop: 8 }}>
              <img
                src={previewUrl}
                alt="Selected face"
                style={{ width: 160, height: 120, objectFit: "cover", border: "1px solid #ccc" }}
              />
            </div>
          )}
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
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "4px 12px 4px 0" }}>
                Enrolled At
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "4px 0" }}></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.name}>
                <td style={{ padding: "4px 12px 4px 0" }}>{emp.name}</td>
                <td style={{ padding: "4px 12px 4px 0" }}>{new Date(emp.enrolled_at + "Z").toLocaleString()}</td>
                <td style={{ padding: "4px 0" }}>
                  <button
                    type="button"
                    onClick={() => handleDelete(emp.name)}
                    disabled={deletingName === emp.name}
                  >
                    {deletingName === emp.name ? "Removing..." : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
