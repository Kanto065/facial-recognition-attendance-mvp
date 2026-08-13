export const API_BASE = "";

export async function enrollEmployee(name, file) {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("image", file);

  const res = await fetch(`${API_BASE}/enroll`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Enroll failed (${res.status})`);
  }

  return res.json();
}

export async function recognizeFrame(blob) {
  const formData = new FormData();
  formData.append("image", blob, "frame.jpg");

  const res = await fetch(`${API_BASE}/recognize`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Recognize failed (${res.status})`);
  }

  return res.json();
}

export async function listEmployees() {
  const res = await fetch(`${API_BASE}/employees`);
  if (!res.ok) {
    throw new Error(`Failed to list employees (${res.status})`);
  }
  return res.json();
}
