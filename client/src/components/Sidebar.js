import React from "react";
import { Link } from "react-router-dom";

const Sidebar = () => {
  return (
    <aside className="w-60 bg-green-100 h-screen p-5 shadow-lg">
      <ul className="space-y-4 font-medium">
        <li className="hover:bg-green-200 p-2 rounded cursor-pointer">
          <Link to="/">🏠 Home</Link>
        </li>
        <li className="hover:bg-green-200 p-2 rounded cursor-pointer">
          <Link to="/analytics">📊 Analytics</Link>
        </li>
        <li className="hover:bg-green-200 p-2 rounded cursor-pointer">
          <Link to="/settings">⚙️ Settings</Link>
        </li>
      </ul>
    </aside>
  );
};

export default Sidebar;
