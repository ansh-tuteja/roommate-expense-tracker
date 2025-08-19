import React from "react";

const Sidebar = () => {
  return (
    <aside className="w-60 bg-green-100 h-screen p-5 shadow-lg">
      <ul className="space-y-4 font-medium">
        <li className="hover:bg-green-200 p-2 rounded cursor-pointer">🏠 Home</li>
        <li className="hover:bg-green-200 p-2 rounded cursor-pointer">📊 Analytics</li>
        <li className="hover:bg-green-200 p-2 rounded cursor-pointer">⚙️ Settings</li>
      </ul>
    </aside>
  );
};

export default Sidebar;
