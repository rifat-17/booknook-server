import express from "express";
import { MongoClient } from 'mongodb';
import "dotenv/config";
import cors from "cors";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const PORT = 8000;


const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

app.use(cors());
app.use(express.json());


const mongoClient = await connectToMongoDB();
const db = mongoClient.db("booknook");
const booksCollection = db.collection("books");


const verifyToken = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ msg: "Unauthorized! No data for you." });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ msg: "Unauthorized! No data for you." });
  }


  const JWKS = createRemoteJWKSet(
    new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
  );

  try {
    const { payload } = await jwtVerify(token, JWKS);
    next();
  } catch (error) {
    return res.status(500).send({ message: "Server Error!" });
  }

}


// add-book
app.post("/add-book", verifyToken, async (req, res) => {
  const data = req.body;
  const result = await booksCollection.insertOne(data);
  console.log(result)
  res.send(result);
})


// get all books (public route)
app.get("/books", async (req, res) => {

  try {
    const books = await booksCollection.find().toArray();
    res.status(200).send(books);
  } catch (error) {
    console.error("Error fetching books:", error);
    res.status(500).send({ message: "Failed to fetch books" });
  }
})


app.get("/", (req, res) => {
  res.send({ message: "Server is running fine!" });
});


app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
});

export default app