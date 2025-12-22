const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;
const jwt = require("jsonwebtoken");
const cookieParser = require('cookie-parser');
require("dotenv").config();


// Middleware
app.use(cors({
  origin: ['http://localhost:5173'], 
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());


const logger = (req,res,next) => {
  console.log("inside the logger middleware");
  next ();
}

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token
  console.log('cookie in the middleware',req.cookies);
  // 
  next()
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



  //  Using JWT related API'S

  app.post('/jwt', async(req,res)=>{
    const userData = req.body;
    const token = jwt.sign(userData, process.env.JWT_ACCCESS_SECRET, {expiresIn: '7d'})
    
    // set token in the the cookies
    
 res.cookie('token', token, {
  httpOnly: true,
  secure: false ,
  sameSite: 'lax'
 })
    
    res.send({success: true})
  })







    // --- Jobs API ---
    
    // ১. সকল জব অথবা নির্দিষ্ট HR-এর পোস্ট করা জব পাওয়ার জন্য (কাউন্টসহ)
    app.get("/jobs", logger, verifyToken, async (req, res) => {
      const email = req.query.email;
      let query = email ? { hr_email: email } : {};
      console.log ('inside applications api', req.cookies);

      const jobs = await jobsCollection.find(query).toArray();

      // প্রতিটি জবের জন্য অ্যাপ্লিকেশন সংখ্যা যোগ করা
      for (const job of jobs) {
        const count = await applicationCollection.countDocuments({ 
            jobId: job._id.toString() 
        });
        job.applicationCount = count;
      }
      res.send(jobs);
    });

    // ২. নির্দিষ্ট একটি জবের ডিটেইলস
    app.get("/jobs/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await jobsCollection.findOne(query);
      res.send(result);
    });

    // ৩. নতুন জব পোস্ট করা
    app.post('/jobs', async (req, res) => {
      const result = await jobsCollection.insertOne(req.body);
      res.send(result);
    });


    // --- Application API ---

    // 4. apllication in job
    app.post("/applications", async (req, res) => {
      const result = await applicationCollection.insertOne(req.body);
      res.send(result);
    });

    // 5. to see desired jobs total application
    app.get("/applications/job/:job_id", async (req, res) => {
      const jobId = req.params.job_id;
      const query = {
        $or: [{ jobId: jobId }, { jobId: new ObjectId(jobId) }]
      };
      const result = await applicationCollection.find(query).toArray();
      res.send(result);
    });

    // 7. user can see his total apllicated jobs lis 
    app.get("/applications", async (req, res) => {
      const email = req.query.email;
      if (!email) return res.status(400).send({ message: "Email required" });

      const applications = await applicationCollection.find({ applicant: email }).toArray();

      // 8. adding other info with job apllication
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

    console.log("Successfully connected to MongoDB!");
  } catch (error) {
    console.error("Connection error:", error);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("Next Hire Server is Running!!"));
app.listen(port, () => console.log(`Next Hire running on port ${port}`));