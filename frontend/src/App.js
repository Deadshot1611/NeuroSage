import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Landing from './pages/Landing'

function App() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f7f8fc]">
      <Navbar />
      <main className="flex-1">
        <Landing />
      </main>
      <Footer />
    </div>
  )
}

export default App
