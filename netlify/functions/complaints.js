const { getStore } = require("@netlify/blobs");

// Helper: get store with strong consistency for accurate reads after writes
function getComplaintsStore() {
  return getStore({ name: "complaints", consistency: "strong" });
}

// Helper: get the counter store (tracks CID auto-increment)
function getCounterStore() {
  return getStore({ name: "counters", consistency: "strong" });
}

// Generate next CID like CS-1001, CS-1002, etc.
async function nextCid() {
  const counterStore = getCounterStore();
  const current = await counterStore.get("complaint-cid", { type: "json" });
  const next = current ? current.value + 1 : 1001;
  await counterStore.setJSON("complaint-cid", { value: next });
  return "CS-" + next;
}

// List all complaints, with optional status filter and sort
async function listComplaints(status, sort) {
  const store = getComplaintsStore();
  const { blobs } = await store.list({ prefix: "complaint/" });

  const complaints = [];
  for (const blob of blobs) {
    const data = await store.get(blob.key, { type: "json" });
    if (data) complaints.push(data);
  }

  // Apply status filter
  let results = complaints;
  if (status) {
    results = results.filter((c) => c.status === status);
  }

  // Apply sort
  if (sort === "newest") {
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else {
    // default: popular (by verifications desc)
    results.sort((a, b) => (b.verifications || 0) - (a.verifications || 0));
  }

  return results;
}

// CORS headers
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  const path = event.path
    .replace("/.netlify/functions/complaints", "")
    .replace(/^\/+/, "");
  const segments = path ? path.split("/") : [];
  const method = event.httpMethod;

  try {
    // Health check: GET with no path segments (from /health redirect)
    if (method === "GET" && segments.length === 0 && !event.queryStringParameters?.status) {
      // Could be health or list — if no query params at all, and path came from /health
      // We'll handle list below; /health redirect will also hit this but that's fine
    }

    // POST /api/complaints — create complaint
    if (method === "POST" && segments.length === 0) {
      const body = JSON.parse(event.body || "{}");
      const store = getComplaintsStore();
      const cid = body.cid || (await nextCid());
      const id = cid.replace("CS-", ""); // use cid number as ID

      const complaint = {
        _id: id,
        cid: cid,
        category: body.category || "Other",
        description: body.description || "",
        imageUrl: body.imageUrl || "",
        aiLabel: body.aiLabel || "",
        lat: body.lat || null,
        lon: body.lon || null,
        ward: body.ward || "Zone A",
        status: body.status || "Submitted",
        priority: body.priority || "Normal",
        verifications: body.verifications || 0,
        createdAt: new Date().toISOString(),
      };

      await store.setJSON("complaint/" + id, complaint);
      return { statusCode: 200, headers, body: JSON.stringify(complaint) };
    }

    // GET /api/complaints — list complaints
    if (method === "GET" && segments.length === 0) {
      const qs = event.queryStringParameters || {};
      const data = await listComplaints(qs.status, qs.sort);
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // GET /api/complaints/:cid — get single complaint
    if (method === "GET" && segments.length === 1) {
      const key = segments[0];
      const store = getComplaintsStore();

      // Try direct ID lookup first
      let complaint = await store.get("complaint/" + key, { type: "json" });

      // If not found, try searching by cid field (e.g., CS-1001 → key 1001)
      if (!complaint) {
        const numericId = key.replace("CS-", "");
        complaint = await store.get("complaint/" + numericId, { type: "json" });
      }

      // If still not found, scan all complaints for matching cid
      if (!complaint) {
        const { blobs } = await store.list({ prefix: "complaint/" });
        for (const blob of blobs) {
          const c = await store.get(blob.key, { type: "json" });
          if (c && (c.cid === key || c._id === key)) {
            complaint = c;
            break;
          }
        }
      }

      if (!complaint) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify(complaint) };
    }

    // PUT /api/complaints/:id/verify — increment verifications
    if (method === "PUT" && segments.length === 2 && segments[1] === "verify") {
      const id = segments[0];
      const store = getComplaintsStore();
      let complaint = await store.get("complaint/" + id, { type: "json" });

      if (!complaint) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Complaint not found" }) };
      }

      complaint.verifications = (complaint.verifications || 0) + 1;
      await store.setJSON("complaint/" + id, complaint);
      return { statusCode: 200, headers, body: JSON.stringify(complaint) };
    }

    // PUT /api/complaints/:cid/status — legacy status update
    if (method === "PUT" && segments.length === 2 && segments[1] === "status") {
      const cid = segments[0];
      const store = getComplaintsStore();
      const numericId = cid.replace("CS-", "");
      let complaint = await store.get("complaint/" + numericId, { type: "json" });

      if (!complaint) {
        // Scan for matching cid
        const { blobs } = await store.list({ prefix: "complaint/" });
        for (const blob of blobs) {
          const c = await store.get(blob.key, { type: "json" });
          if (c && c.cid === cid) {
            complaint = c;
            break;
          }
        }
      }

      if (!complaint) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
      }

      const body = JSON.parse(event.body || "{}");
      complaint.status = body.status || complaint.status;
      await store.setJSON("complaint/" + complaint._id, complaint);
      return { statusCode: 200, headers, body: JSON.stringify({ message: "Updated" }) };
    }

    // PUT /api/complaints/:id — general update
    if (method === "PUT" && segments.length === 1) {
      const id = segments[0];
      const store = getComplaintsStore();
      let complaint = await store.get("complaint/" + id, { type: "json" });

      if (!complaint) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
      }

      const body = JSON.parse(event.body || "{}");
      Object.assign(complaint, body);
      await store.setJSON("complaint/" + id, complaint);
      return { statusCode: 200, headers, body: JSON.stringify({ message: "Updated" }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: "Route not found" }) };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
