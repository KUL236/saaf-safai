require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// serve frontend assets when available
app.use(express.static(path.join(__dirname, "..", "frontend")));

const uri = process.env.MONGO_URI;
if (!uri) {
    console.warn('Warning: MONGO_URI is not set. Using in-memory store.');
} else {
    mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
        .then(() => console.log('🗄️  Connected to MongoDB'))
        .catch(err => console.error('Mongo connection error', err));
}

// log connection events for debugging
mongoose.connection.on('error', err => console.error('Mongo connection error', err));
mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));

app.use("/api/complaints", require("./routes/complaints"));

// simple health check
app.get('/health', (req, res) => res.send('OK'));

// serve index.html for any other route (SPA support)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on ${port}`));