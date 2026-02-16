import express from "express";
import cors from "cors";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import conversationRoutes from "./routes/conversation.routes.js";
import groupRoutes from "./routes/group.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import messageRoutes from "./routes/message.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use(healthRoutes);
app.use(authRoutes);
app.use(userRoutes);
app.use(conversationRoutes);
app.use(groupRoutes);
app.use(contactRoutes);
app.use(messageRoutes);
app.use(notificationRoutes);

// Error handler (must be last)
app.use(errorHandler);

export default app;
