import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import NewScan from './pages/NewScan';
import ScanProgress from './pages/ScanProgress';
import ScanResults from './pages/ScanResults';
import SavedResults from './pages/SavedResults';
import FolderMarking from './pages/FolderMarking';
import SchemeProgress from './pages/SchemeProgress';
import SchemeCategory from './pages/SchemeCategory';
import CategoryDetail from './pages/CategoryDetail';
import MoveToFolder from './pages/MoveToFolder';
import MoveToTrash from './pages/MoveToTrash';
import MoveProgress from './pages/MoveProgress';
import MovingComplete from './pages/MovingComplete';

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new-scan" element={<NewScan />} />
          <Route path="/scan-progress" element={<ScanProgress />} />
          <Route path="/scan-results" element={<ScanResults />} />
          <Route path="/saved-results" element={<SavedResults />} />
          <Route path="/folder-marking" element={<FolderMarking />} />
          <Route path="/scheme-progress" element={<SchemeProgress />} />
          <Route path="/scheme-category" element={<SchemeCategory />} />
          <Route path="/category/:type" element={<CategoryDetail />} />
          <Route path="/move-folder" element={<MoveToFolder />} />
          <Route path="/move-trash" element={<MoveToTrash />} />
          <Route path="/move-progress" element={<MoveProgress />} />
          <Route path="/moving-complete" element={<MovingComplete />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
