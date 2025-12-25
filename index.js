const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require('cookie-parser');
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// --- 1. Middleware Configuration ---
app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://nexthire-38482.web.app'
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
}));
app.use(express.json());
app.use(cookieParser());

// --- 2. Custom Middlewares ---
const logger = (req, res, next) => {
    console.log('Request received at:', new Date().toLocaleString());
    next();
}

const verifyToken = (req, res, next) => {
    const token = req?.cookies?.token;
    
    if (!token) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }

    jwt.verify(token, process.env.JWT_ACCCESS_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'Unauthorized access' });
        }
        req.user = decoded; 
        next();
    });
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@simple-crud-server.a0arf8b.mongodb.net/?appName=simple-crud-server`;
const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

async function run() {
    try {
        // প্রোডাকশনে কানেকশন স্ট্যাবল রাখার জন্য
        // await client.connect(); 
        
        const db = client.db("NextHire");
        const jobsCollection = db.collection("Jobs");
        const applicationCollection = db.collection("applications");

        // --- 3. JWT Token Issue API ---
        app.post('/jwt', async (req, res) => {
            const userData = req.body;
            const token = jwt.sign(userData, process.env.JWT_ACCCESS_SECRET, { expiresIn: '7d' });

            res.cookie('token', token, {
                httpOnly: true, 
                secure: true, 
                sameSite: 'none', 
                path: '/' 
            })
            .send({ success: true });
        });

        // --- 4. Logout API ---
        app.post('/logout', (req, res) => {
            res.clearCookie('token', { 
                maxAge: 0,
                httpOnly: true,
                secure: true,
                sameSite: 'none',
                path: '/'
            }).send({ success: true });
        });

        // --- 5. Jobs API ---

        // পাবলিকলি সব জব দেখা
        app.get("/jobs", logger, async (req, res) => {
            const email = req.query.email;
            let query = email ? { hr_email: email } : {};
            
            const jobs = await jobsCollection.find(query).toArray();
            for (const job of jobs) {
                const count = await applicationCollection.countDocuments({ jobId: job._id.toString() });
                job.applicationCount = count;
            }
            res.send(jobs);
        });

        // সিঙ্গেল জব ডিটেইলস (আইডি ভ্যালিডেশনসহ)
        app.get("/jobs/:id", async (req, res) => {
            try {
                const id = req.params.id;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ message: "Invalid ID format" });
                }
                const query = { _id: new ObjectId(id) };
                const result = await jobsCollection.findOne(query);
                if (!result) return res.status(404).send({ message: "Job not found" });
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Internal Server Error" });
            }
        });

        // জব পোস্ট করা (প্রাইভেট)
        app.post('/jobs', logger, verifyToken, async (req, res) => {
            const result = await jobsCollection.insertOne(req.body);
            res.send(result);
        });

        // --- 6. Application API ---
        app.get("/applications", logger, verifyToken, async (req, res) => {
            const email = req.query.email;
            if (req.user.email !== email) return res.status(403).send({ message: 'Forbidden access' });
            
            const applications = await applicationCollection.find({ applicant: email }).toArray();
            for (const appTask of applications) {
                if (ObjectId.isValid(appTask.jobId)) {
                    const job = await jobsCollection.findOne({ _id: new ObjectId(appTask.jobId) });
                    if (job) {
                        appTask.company = job.company;
                        appTask.title = job.title || job.jobTitle;
                        appTask.company_logo = job.company_logo;
                    }
                }
            }
            res.send(applications);
        });

        app.get("/applications/job/:job_id", logger, verifyToken, async (req, res) => {
            const result = await applicationCollection.find({ jobId: req.params.job_id }).toArray();
            res.send(result);
        });

        app.post("/applications", async (req, res) => {
            const result = await applicationCollection.insertOne(req.body);
            res.send(result);
        });

        console.log("Successfully connected to MongoDB!");
    } catch (error) {
        console.error("Connection error:", error);
    }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("Next Hire Server is Running!!"));

// Vercel এর জন্য app export করা ভালো, তবে listener ও থাকতে পারে
app.listen(port, () => console.log(`Next Hire running on port ${port}`));