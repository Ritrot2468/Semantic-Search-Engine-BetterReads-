import sampleData from "./sampleData.json";
import './App.css'
import BookDetailsPage from "./components/Book/BookDetailsPage.jsx";
import Login from './components/Login/Login.jsx'
import Signup from "./components/Signup/Signup.jsx";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

function App() {


  return (
      <>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          {/* <Route path="/login" element={<Login />} /> */}
          {/* <Route path="/clothes" element={<Clothes />} />
          <Route path="/books" element={<Books />} />
          <Route path="/search" element={<Search />} />
          <Route path="/cart" element={<Cart />} /> */}
        </Routes>
			</Router> 
      </>
  
  )
}

export default App
