import express from "express";
import dotenv from "dotenv";
import routes from "./routes/todo.router.js";
import connectDB from "./config/db.js";
dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 6000;

app.get("/", (req, res) => {
  res.send("Hello from CRUD Assignment");
});

// API endpoints
app.use("/", routes);

const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`server is running on PORT : ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    process.exit(1);
  }
};

startServer();
