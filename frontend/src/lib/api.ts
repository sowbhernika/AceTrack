import axios from "axios";
import { toast } from "sonner";

const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    const message =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message ||
      "An unexpected error occurred";

    const status = error.response?.status;

    if (status === 401) {
      toast.error("Unauthorized. Please log in again.");
    } else if (status === 403) {
      toast.error("You do not have permission to perform this action.");
    } else if (status === 404) {
      toast.error("The requested resource was not found.");
    } else if (status === 422) {
      toast.error("Validation error. Please check your input.");
    } else if (status && status >= 500) {
      toast.error("Server error. Please try again later.");
    } else if (error.code === "ERR_NETWORK") {
      toast.error("Network error. Please check your connection.");
    } else {
      toast.error(message);
    }

    return Promise.reject(error);
  }
);

export default api;
