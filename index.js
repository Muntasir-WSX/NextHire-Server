const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require('cookie-parser');
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// --- ১. Middleware Configuration ---
app.use(cors({
    origin: ['http://localhost:5173'], // ফ্রন্টএন্ড ইউআরএল
    credentials: true, // কুকি পাঠানোর জন্য এটি বাধ্যতামূলক
}));
app.use(express.json());
app.use(cookieParser()); // কুকি রিড করার জন্য এটি অবশ্যই রাউটের উপরে থাকবে


// --- ২. Custom Middlewares (লগ দেখার জন্য) ---

const logger = (req, res, next) => {
    console.log(`--- Request: ${req.method} ${req.url} ---`);
    next();
}

const verifyToken = (req, res, next) => {
    const token = req?.cookies?.token;

    console.log('--- Verify Token Middleware ---');
    console.log('All Cookies found in Backend:', req.cookies); // এখানে আপনি আপনার মেসেজটি পাবেন
    console.log('Extracted Token:', token); 

    if (!token) {
        console.log('No token found in cookies! Access Denied.');
        return res.status(401).send({ message: 'Unauthorized access' });
    }

    jwt.verify(token, process.env.JWT_ACCCESS_SECRET, (err, decoded) => {
        if (err) {
            console.log('Token verification failed!');
            return res.status(401).send({ message: 'Unauthorized access' });
        }
        
        req.user = decoded; 
        console.log('Token verified for user:', decoded.email);
        next();
    });
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@simple-crud-server.a0arf8b.mongodb.net/?appName=simple-crud-server`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    try {
        const db = client.db("NextHire");
        const jobsCollection = db.collection("Jobs");
        const applicationCollection = db.collection("applications");

        // --- ৩. JWT Token Issue API ---
        app.post('/jwt', async (req, res) => {
            const userData = req.body;
            const token = jwt.sign(userData, process.env.JWT_ACCCESS_SECRET, { expiresIn: '7d' });

            // কুকিতে টোকেন সেট করার সঠিক উপায়
            res.cookie('token', token, {
                httpOnly: true, // সিকিউরিটির জন্য
                secure: false,  // লোকালহোস্ট (http) এর জন্য false রাখতে হবে
                sameSite: 'lax', // ক্রস-সাইট রিকোয়েস্টের জন্য 'lax' বা 'none'
                path: '/' // এটি নিশ্চিত করে যে সব রাউটে কুকিটি পাওয়া যাবে
            })
            .send({ success: true });
        });

        // --- ৪. Logout API ---
        app.post('/logout', (req, res) => {
            res.clearCookie('token', { 
                maxAge: 0,
                httpOnly: true,
                secure: false,
                sameSite: 'lax',
                path: '/'
            }).send({ success: true });
        });


        // --- ৫. Jobs API ---
        
        // সকল জব বা নির্দিষ্ট ইউজারের জব (verifyToken যুক্ত)
        app.get("/jobs", logger, verifyToken, async (req, res) => {
            const email = req.query.email;
            
            // যদি ইমেইল থাকে, তবে চেক করা হচ্ছে সে নিজের ডাটা দেখছে কি না
            if (email && req.user.email !== email) {
                return res.status(403).send({ message: 'Forbidden access' });
            }

            let query = email ? { hr_email: email } : {};
            const jobs = await jobsCollection.find(query).toArray();

            // অ্যাপ্লিকেশন কাউন্ট যোগ করা
            for (const job of jobs) {
                const count = await applicationCollection.countDocuments({ 
                    jobId: job._id.toString() 
                });
                job.applicationCount = count;
            }
            res.send(jobs);
        });

        app.get("/jobs/:id", async (req, res) => {
            const query = { _id: new ObjectId(req.params.id) };
            const result = await jobsCollection.findOne(query);
            res.send(result);
        });

        app.post('/jobs', logger, verifyToken, async (req, res) => {
            const result = await jobsCollection.insertOne(req.body);
            res.send(result);
        });


        // --- ৬. Application API ---

        app.get("/applications", logger, verifyToken, async (req, res) => {
            const email = req.query.email;

            if (req.user.email !== email) {
                return res.status(403).send({ message: 'Forbidden access' });
            }

            const applications = await applicationCollection.find({ applicant: email }).toArray();

            for (const appTask of applications) {
                const job = await jobsCollection.findOne({ _id: new ObjectId(appTask.jobId) });
                if (job) {
                    appTask.company = job.company;
                    appTask.title = job.title || job.jobTitle;
                    appTask.company_logo = job.company_logo;
                }
            }
            res.send(applications);
        });

        app.get("/applications/job/:job_id", logger, verifyToken, async (req, res) => {
            const result = await applicationCollection.find({ 
                jobId: req.params.job_id 
            }).toArray();
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
app.listen(port, () => console.log(`Next Hire running on port ${port}`));