import express from "express";
import { MongoClient, ObjectId } from 'mongodb';
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


const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ msg: "Unauthorized! No data for you." });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "Unauthorized! No data for you." });
  }


  const JWKS = createRemoteJWKSet(
    new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
  );

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(500).send({ message: "Server Error!" });
  }

}


// add-book (private)
app.post("/add-book", verifyToken, async (req, res) => {
  try {
    const { title, author, category, description, imageUrl } = req.body;

    if (
      !title?.trim() ||
      !author?.trim() ||
      !category ||
      !description?.trim() ||
      !imageUrl?.trim()
    ) {
      return res.status(400).json({
        message: "All book fields are required.",
      });
    }

    const newBook = {
      title: title.trim(),
      author: author.trim(),
      category,
      description: description.trim(),
      imageUrl: imageUrl.trim(),
      addedBy: {
        userId: req.user.sub,
        name: req.user.name || "BookNook Member",
        email: req.user.email || "",
      },
      createdAt: new Date(),
    };

    if (!newBook.addedBy.userId) {
      return res.status(401).json({
        message: "User identity not found in token.",
      });
    }

    const result = await booksCollection.insertOne(newBook);

    res.status(201).json({
      success: true,
      message: "Book added successfully!",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Add book error:", error);

    res.status(500).json({
      message: "Failed to add book.",
    });
  }
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


//book details (private)
app.get("/books/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check whether the ID is a valid MongoDB ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid book ID.",
      });
    }
    // Find the book in MongoDB
    const book = await booksCollection.findOne({
      _id: new ObjectId(id),
    });

    // If the book doesn't exist
    if (!book) {
      return res.status(404).json({
        message: "Book not found.",
      });
    }

    res.status(200).json(book);

  } catch (error) {
    console.error("Error fetching book:", error);

    res.status(500).json({
      message: "Failed to fetch book.",
    });
  }
})


// Get books added by the logged-in user
app.get("/my-books", verifyToken, async (req, res) => {
  try {
    const userId = req.user.sub;

    const myBooks = await booksCollection.find({
      "addedBy,userId": userId,
    }).toArray();

    res.status(200).json(myBooks);

  } catch (error) {
    console.error("Error fetching my books:", error);

    res.status(500).json({
      message: "Failed to fetch your books.",
    });

  }
})


// Update a book (protected route)
app.patch("/books/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.sub;

    const { title, author, category, description, imageUrl } = req.body;

    // Validate book ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid book ID.",
      });
    }

    // Validate required fields
    if (
      !title?.trim() ||
      !author?.trim() ||
      !category ||
      !description?.trim() ||
      !imageUrl?.trim()
    ) {
      return res.status(400).json({
        message: "All book fields are required.",
      });
    }

    // Update only the owner's book
    const result = await booksCollection.updateOne(
      {
        _id: new ObjectId(id),
        "addedBy.userId": userId,
      },
      {
        $set: {
          title: title.trim(),
          author: author.trim(),
          category,
          description: description.trim(),
          imageUrl: imageUrl.trim(),
          updatedAt: new Date(),

        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: "Book not found or you are not authorized to update it.",
      });
    }

    //getting an error?  uncomment it. and check
    // res.status(200).json({
    //   success: true,
    //   message: "Book deleted successfully!",
    // });
    res.status(200).json(result)

  } catch (error) {
    console.error("Update book error:", error);

    res.status(500).json({
      message: "Failed to update book.",
    });

  }
})


// Delete a book (protected route)
app.delete("/books/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.sub;

     // Validate book ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid book ID.",
      });
    }

    const result = await booksCollection.deleteOne({
      _id: new ObjectId(id),
      "addedBy.userId": userId,
    })

    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: "Book not found or you are not authorized to delete it.",
      });
    }

    //getting an error?  uncomment it. and check
    // res.status(200).json({
    //   success: true,
    //   message: "Book deleted successfully!",
    // });
    res.status(200).json(result);

  } catch (error) {
    console.error("Delete book error:", error);

    res.status(500).json({
      message: "Failed to delete book.",
    });

  }
})


app.get("/", (req, res) => {
  res.send({ message: "Server is running fine!" });
});


app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
});

export default app