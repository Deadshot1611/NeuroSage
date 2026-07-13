import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import ASDModule from './pages/ASDModule'
import Navbar from './components/Navbar'
import Footer from './components/Footer'


export default function App() {
  return (
    <Router>
      <div className="min-h-screen flex flex-col bg-[#f7f8fc]">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/asd" element={<ASDModule />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  )
}