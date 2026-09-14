import { motion } from "framer-motion";
import { useState } from "react";

export default function Nav() {
  const [toggled, setToggled] = useState(false);
  return (
    <nav class="nav">
      <svg
        width="250"
        height={4}
        viewBox="0 0 250 4"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M2 2L428 2"
          strokeWidth={2}
          stroke="#282828"
          strokeLinecap="round"
        />
      </svg>
      {/* Logo image */}
      <div class="nav__img">
        <a href="./">
          <img
            src="./src/assets/LordsLogo.png"
            alt="mobile logo"
            height="100em"
            width="auto"
          />
        </a>
      </div>
      {/* Links */}
      <ul class="nav__links">
        <li>
          <a href="./">Home</a>
        </li>
        <li>
          <a href="./about">About</a>
        </li>
        <li>
          <a href="./contact">Contact</a>
        </li>
        <li>
          <a href="./staff">Staff</a>
        </li>
        <li>
          <a href="./menu">Menu</a>
        </li>
      </ul>
      {/* hamburger menu */}
      <div class="nav__hamburger">
        <span
          style={{
            display: "block",
            height: ".5px",
            width: "2em",
            backgroundColor: "#282828",
          }}
        ></span>
      </div>
    </nav>
  );
}
