import React from "react";
import { Bell, MessageCircle } from "lucide-react";

const Navbar = () => {
  return (
    <nav className="flex justify-between items-center bg-green-700 text-white px-6 py-3 shadow-md">
      {/* Left: Logo */}
      <div className="text-xl font-bold">Roommate Tracker</div>

      {/* Right: Icons */}
      <div className="flex items-center space-x-6">
        <MessageCircle className="cursor-pointer hover:text-gray-200" />
        <Bell className="cursor-pointer hover:text-gray-200" />
        <img
          src="https://via.placeholder.com/40"
          alt="profile"
          className="rounded-full w-10 h-10 border-2 border-white"
        />
      </div>
    </nav>
  );
};

export default Navbar;
