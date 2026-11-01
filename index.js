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
const borrowsCollection = db.collection("borrows");

// Prevent a user from borrowing the same book more than once
await borrowsCollection.createIndex(
  {
    bookId: 1,
    userId: 1,
  },
  {
    unique: true,
  }
);



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
    const { title, author, category, description, imageUrl, totalCopies } = req.body;

    if (
      !title?.trim() ||
      !author?.trim() ||
      !category ||
      !description?.trim() ||
      !imageUrl?.trim() ||
      !Number.isInteger(totalCopies) ||
      totalCopies < 1
    ) {
      return res.status(400).json({
        message: "All fields are required and total copies must be at least 1.",
      });
    }

    const newBook = {
      title: title.trim(),
      author: author.trim(),
      category,
      description: description.trim(),
      imageUrl: imageUrl.trim(),
      totalCopies,
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
      "addedBy.userId": userId,
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

    const { title, author, category, description, imageUrl, totalCopies } = req.body;

    // Validate book ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid book ID.",
      });
    }

    if (!Number.isInteger(totalCopies) || totalCopies < 1) {
      return res.status(400).json({
        message: "Total copies must be at least 1.",
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
          totalCopies,
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


// Borrow a book
app.post("/borrows", verifyToken, async (req, res) => {
  let reservedBookId = null;

  try {
    const { bookId } = req.body;
    const userId = req.user.sub;
    const userEmail = req.user.email;

    // Validate book ID
    if (!bookId || !ObjectId.isValid(bookId)) {
      return res.status(400).json({
        message: "Invalid book ID.",
      });
    }

    if (!userId || !userEmail) {
      return res.status(401).json({
        message: "User information is missing from token.",
      });
    }

    // Check whether user already borrowed this book
    const existingBorrow = await borrowsCollection.findOne({
      bookId,
      userId,
    });

    if (existingBorrow) {
      return res.status(409).json({
        message: "You have already borrowed this book.",
      });
    }

    // Atomically decrease available copies
    const inventoryResult = await booksCollection.updateOne(
      {
        _id: new ObjectId(bookId),
        totalCopies: { $gt: 0 },
      },
      {
        $inc: {
          totalCopies: -1,
        },
      }
    );

    if (inventoryResult.matchedCount === 0) {
      const book = await booksCollection.findOne({
        _id: new ObjectId(bookId),
      });

      if (!book) {
        return res.status(404).json({
          message: "Book not found.",
        });
      }

      return res.status(409).json({
        message: "This book is currently not available.",
      });
    }

    reservedBookId = new ObjectId(bookId);

    // Get book information
    const book = await booksCollection.findOne({
      _id: reservedBookId,
    });

    // Calculate 14-day borrowing period
    const borrowDate = new Date();
    const returnDate = new Date(borrowDate);

    returnDate.setDate(returnDate.getDate() + 14);

    // Create borrow record
    const borrowRecord = {
      bookId: book._id.toString(),
      bookTitle: book.title,
      bookImage: book.imageUrl,
      userId,
      userEmail,
      borrowDate,
      returnDate,
    };

    // Save borrow record to mongoDB
    const result = await borrowsCollection.insertOne(borrowRecord);

    reservedBookId = null;

    res.status(201).json({
      success: true,
      message: "Book borrowed successfully!",
      borrowId: result.insertedId,
    });
  } catch (error) {
    console.error("Borrow book error:", error);

    // Restore inventory if saving the borrow record failed
    if (reservedBookId) {
      await booksCollection.updateOne(
        { _id: reservedBookId },
        { $inc: { totalCopies: 1 } }
      );
    }

    if (error.code === 11000) {
      return res.status(409).json({
        message: "You have already borrowed this book.",
      });
    }

    res.status(500).json({
      message: "Failed to borrow book.",
    });
  }
});


// Get logged-in user's borrowed books
app.get("/my-borrows", verifyToken, async (req, res) => {
  try {
    const userId = req.user.sub;

    const myBorrows = await borrowsCollection
      .find({ userId })
      .sort({ borrowDate: -1 })
      .toArray();

    res.status(200).json(myBorrows);


  } catch (error) {
    console.error("Error fetching my borrows:", error);

    res.status(500).json({
      message: "Failed to fetch your borrowed books.",
    });

  }
})


// Return a borrowed book
app.delete("/borrows/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.sub;

    // Validate borrow ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid borrow ID.",
      });
    }

    // Delete only this user's borrowing record
    const borrow = await borrowsCollection.findOneAndDelete({
      _id: new ObjectId(id),
      userId,
    });

    if (!borrow) {
      return res.status(404).json({
        message: "Borrow record not found or unauthorized.",
      });
    }

    // Increase available copies
    const inventoryResult = await booksCollection.updateOne(
      {
        _id: new ObjectId(borrow.bookId),
      },
      {
        $inc: {
          totalCopies: 1,
        },
      }
    );

    if (inventoryResult.matchedCount === 0) {
      console.error("Book not found while restoring inventory:", borrow.bookId);

      return res.status(500).json({
        message: "Borrow record was deleted, but inventory could not be restored.",
      });
    }




    res.status(200).json({
      success: true,
      message: "Book returned successfully!",
    });


  } catch (error) {
    console.error("Return book error:", error);

    res.status(500).json({
      message: "Failed to return book.",
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