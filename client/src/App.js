import React from "react";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";

function App() {
  return (
    <div className="flex flex-col h-screen">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-6 bg-gray-50">
          <h1 className="text-2xl font-bold">Welcome to Roommate Expense Tracker</h1>
          <p className="mt-2 text-gray-600">Start adding expenses and track with your roommates easily!</p>
        </main>
      </div>
    </div>
  );
}

export default App;
