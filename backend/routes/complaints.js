const router = require("express").Router();
const mongoose = require("mongoose");
const Complaint = require("../models/complaints");

// if URI not provided we operate entirely in memory
const useMemory = !process.env.MONGO_URI;
if (useMemory) {
    // disable mongoose buffering so that accidental query doesn't hang
    mongoose.set('bufferCommands', false);
}

// fallback store when Mongo isn't available
const inMemory = {
    data: [],
    cidCounter: 1000
};

function isDbReady() {
    if (useMemory) return false;
    return mongoose.connection && mongoose.connection.readyState === 1;
}

function generateCid() {
    inMemory.cidCounter += 1;
    return "CS-" + inMemory.cidCounter;
}

async function listComplaints(filter = {}, sort = "popular") {
    console.log('listComplaints called; useMemory=', useMemory, 'readyState=', mongoose.connection.readyState);
    if (isDbReady()) {
        let query = Complaint.find(filter);
        if (!sort || sort === "popular") query = query.sort({ verifications: -1 });
        if (sort === "newest") query = query.sort({ createdAt: -1 });
        return query;
    }
    let results = inMemory.data.filter(c => {
        for (let k in filter) {
            if (c[k] !== filter[k]) return false;
        }
        return true;
    });
    if (!sort || sort === "popular") {
        results.sort((a, b) => (b.verifications || 0) - (a.verifications || 0));
    }
    if (sort === "newest") {
        results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return results;
}

async function findOne(key) {
    if (isDbReady()) {
        if (/^[0-9a-fA-F]{24}$/.test(key)) {
            return Complaint.findById(key);
        }
        return Complaint.findOne({ cid: key });
    }
    return inMemory.data.find(c => c._id === key || c.cid === key) || null;
}

async function saveComplaint(obj) {
    if (isDbReady()) {
        const c = new Complaint(obj);
        if (!c.cid) c.cid = generateCid();
        return c.save();
    }
    const rec = Object.assign({}, obj);
    rec._id = String(inMemory.data.length + 1);
    rec.createdAt = rec.createdAt || new Date();
    rec.verifications = rec.verifications || 0;
    if (!rec.cid) rec.cid = generateCid();
    inMemory.data.push(rec);
    return rec;
}

// create complaint
router.post("/", async (req, res) => {
    try {
        const c = await saveComplaint(req.body);
        res.json(c);
    } catch (err) {
        console.error(err);
        res.status(500).send("Failed to save complaint");
    }
});

// read list
router.get("/", async (req, res) => {
    try {
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        const data = await listComplaints(filter, req.query.sort);
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).send("Failed to fetch complaints");
    }
});

// read one
router.get("/:cid", async (req, res) => {
    try {
        const data = await findOne(req.params.cid);
        if (!data) return res.status(404).send("Not found");
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error looking up complaint");
    }
});

// update by id
router.put("/:id", async (req, res) => {
    try {
        if (isDbReady()) {
            await Complaint.updateOne({ _id: req.params.id }, req.body);
        } else {
            const idx = inMemory.data.findIndex(c => c._id === req.params.id);
            if (idx !== -1) Object.assign(inMemory.data[idx], req.body);
        }
        res.send("Updated");
    } catch (err) {
        console.error(err);
        res.status(500).send("Update failed");
    }
});

// legacy status-only route
router.put("/:cid/status", async (req, res) => {
    try {
        if (isDbReady()) {
            await Complaint.updateOne({ cid: req.params.cid }, { status: req.body.status });
        } else {
            const rec = inMemory.data.find(c => c.cid === req.params.cid);
            if (rec) rec.status = req.body.status;
        }
        res.send("Updated");
    } catch (err) {
        console.error(err);
        res.status(500).send("Update failed");
    }
});

// increment verifications
router.put("/:id/verify", async (req, res) => {
    try {
        let complaint;
        if (isDbReady()) {
            complaint = await Complaint.findById(req.params.id);
            if (!complaint) return res.status(404).send("Complaint not found");
            complaint.verifications = (complaint.verifications || 0) + 1;
            await complaint.save();
        } else {
            const rec = inMemory.data.find(c => c._id === req.params.id);
            if (!rec) return res.status(404).send("Complaint not found");
            rec.verifications = (rec.verifications || 0) + 1;
            complaint = rec;
        }
        res.json(complaint);
    } catch (err) {
        console.error(err);
        res.status(500).send("Verification failed");
    }
});

module.exports = router;
