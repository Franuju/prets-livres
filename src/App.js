import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, onSnapshot, doc, query, orderBy } from 'firebase/firestore';

// Définition des variables globales pour Firebase (fournies par l'environnement Canvas)
const firebaseConfig = {
  apiKey: "AIzaSyDzfTZF1hwBqhe0p9H7RS7aXxeeFqmHnpM",
  authDomain: "gestionnaire-prets-livres.firebaseapp.com",
  projectId: "gestionnaire-prets-livres",
  storageBucket: "gestionnaire-prets-livres.firebasestorage.app",
  messagingSenderId: "414072639258",
  appId: "1:414072639258:web:e957eee095286eb1f3e6a3",
  measurementId: "G-13SQSRGVMJ"
};

// Laissez ces lignes telles quelles si vous n'avez pas de token d'authentification personnalisé
const appId = firebaseConfig.appId; // Utilisez l'appId de votre configuration Firebase
const initialAuthToken = null; // Pas de token d'authentification personnalisé pour un déploiement standard


// Composant principal de l'application
function App() {
  // États de l'application
  const [db, setDb] = useState(null); // Instance Firestore
  const [auth, setAuth] = useState(null); // Instance Auth
  const [userId, setUserId] = useState(null); // ID de l'utilisateur
  const [loans, setLoans] = useState([]); // Liste des prêts
  const [currentLoan, setCurrentLoan] = useState(null); // Prêt en cours d'édition
  const [form, setForm] = useState({ // État du formulaire
    bookTitle: '',
    friendName: '',
    loanDate: '',
    returnDate: '',
    status: 'Emprunté',
  });
  const [searchTerm, setSearchTerm] = useState(''); // Terme de recherche pour le filtre
  const [sortConfig, setSortConfig] = useState({ key: 'loanDate', direction: 'descending' }); // Configuration du tri
  const [message, setMessage] = useState(''); // Messages utilisateur
  const [loading, setLoading] = useState(true); // État de chargement

  // Initialisation de Firebase et authentification
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authentication = getAuth(app);

      setDb(firestore);
      setAuth(authentication);

      // Écoute les changements d'état d'authentification
      const unsubscribeAuth = onAuthStateChanged(authentication, async (user) => {
        if (user) {
          setUserId(user.uid);
          setMessage(`Connecté en tant que: ${user.uid}`);
        } else {
          // Si pas d'utilisateur, tente de se connecter avec le token ou anonymement
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(authentication, initialAuthToken);
            } else {
              await signInAnonymously(authentication);
            }
          } catch (error) {
            console.error("Erreur d'authentification:", error);
            setMessage("Erreur de connexion. Veuillez réessayer.");
          }
        }
        setLoading(false); // Fin du chargement après l'authentification
      });

      return () => unsubscribeAuth(); // Nettoyage de l'écouteur
    } catch (error) {
      console.error("Erreur d'initialisation de Firebase:", error);
      setMessage("Erreur lors de l'initialisation de l'application.");
      setLoading(false);
    }
  }, []);

  // Écoute les données Firestore en temps réel
  useEffect(() => {
    if (db && userId) {
      // Chemin de la collection pour les données privées de l'utilisateur
      const loansCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/loans`);
      // Crée une requête pour trier par date d'emprunt par défaut
      const q = query(loansCollectionRef);

      const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        const fetchedLoans = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setLoans(fetchedLoans);
        setMessage(''); // Efface les messages après le chargement des données
      }, (error) => {
        console.error("Erreur lors de la récupération des prêts:", error);
        setMessage("Erreur lors du chargement des prêts.");
      });

      return () => unsubscribeSnapshot(); // Nettoyage de l'écouteur
    }
  }, [db, userId]); // Dépendances: db et userId

  // Gère les changements dans les champs du formulaire
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  // Ajoute ou met à jour un prêt
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!db || !userId) {
      setMessage("Erreur: Base de données non initialisée ou utilisateur non connecté.");
      return;
    }

    try {
      if (currentLoan) {
        // Mise à jour d'un prêt existant
        const loanRef = doc(db, `artifacts/${appId}/users/${userId}/loans`, currentLoan.id);
        await updateDoc(loanRef, form);
        setMessage('Prêt mis à jour avec succès !');
      } else {
        // Ajout d'un nouveau prêt
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/loans`), form);
        setMessage('Prêt ajouté avec succès !');
      }
      // Réinitialise le formulaire et l'état d'édition
      setForm({
        bookTitle: '',
        friendName: '',
        loanDate: '',
        returnDate: '',
        status: 'Emprunté',
      });
      setCurrentLoan(null);
    } catch (error) {
      console.error("Erreur lors de l'opération CRUD:", error);
      setMessage("Erreur lors de l'enregistrement du prêt.");
    }
  };

  // Charge un prêt dans le formulaire pour édition
  const handleEdit = (loan) => {
    setCurrentLoan(loan);
    setForm({
      bookTitle: loan.bookTitle,
      friendName: loan.friendName,
      loanDate: loan.loanDate,
      returnDate: loan.returnDate,
      status: loan.status,
    });
  };

  // Annule l'édition et réinitialise le formulaire
  const handleCancelEdit = () => {
    setCurrentLoan(null);
    setForm({
      bookTitle: '',
      friendName: '',
      loanDate: '',
      returnDate: '',
      status: 'Emprunté',
    });
  };

  // Supprime un prêt
  const handleDelete = async (id) => {
    if (!db || !userId) {
      setMessage("Erreur: Base de données non initialisée ou utilisateur non connecté.");
      return;
    }
    // Utilise une boîte de dialogue personnalisée au lieu de confirm()
    const confirmDelete = window.confirm("Êtes-vous sûr de vouloir supprimer ce prêt ?");
    if (confirmDelete) {
      try {
        await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/loans`, id));
        setMessage('Prêt supprimé avec succès !');
      } catch (error) {
        console.error("Erreur lors de la suppression du prêt:", error);
        setMessage("Erreur lors de la suppression du prêt.");
      }
    }
  };

  // Gère le tri du tableau
  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  // Trie et filtre les prêts affichés
  const sortedAndFilteredLoans = useMemo(() => {
    let sortableLoans = [...loans];

    // Filtrage
    if (searchTerm) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      sortableLoans = sortableLoans.filter(loan =>
        loan.bookTitle.toLowerCase().includes(lowerCaseSearchTerm) ||
        loan.friendName.toLowerCase().includes(lowerCaseSearchTerm) ||
        loan.loanDate.toLowerCase().includes(lowerCaseSearchTerm) ||
        loan.returnDate.toLowerCase().includes(lowerCaseSearchTerm) ||
        loan.status.toLowerCase().includes(lowerCaseSearchTerm)
      );
    }

    // Tri
    if (sortConfig.key) {
      sortableLoans.sort((a, b) => {
        const aValue = a[sortConfig.key] || '';
        const bValue = b[sortConfig.key] || '';

        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableLoans;
  }, [loans, searchTerm, sortConfig]);

  // Affiche un indicateur de chargement
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p className="text-lg text-gray-700">Chargement de l'application...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 lg:p-8 font-sans">
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <style>
        {`
          body {
            font-family: 'Inter', sans-serif;
          }
          .table-header-button {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 0;
            background: none;
            border: none;
            cursor: pointer;
            font-weight: 600;
            color: #374151; /* gray-700 */
          }
          .table-header-button:hover {
            color: #1f2937; /* gray-900 */
          }
        `}
      </style>

      <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-lg p-6 sm:p-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6 text-center">
          Gestionnaire de Prêts de Livres
        </h1>

        {/* Affichage de l'ID utilisateur pour le débogage/information */}
        {userId && (
          <p className="text-sm text-gray-600 mb-4 text-center">
            Votre ID utilisateur: <span className="font-mono bg-gray-200 px-2 py-1 rounded">{userId}</span>
          </p>
        )}

        {/* Section du formulaire d'ajout/édition */}
        <div className="mb-8 p-6 bg-blue-50 rounded-lg shadow-inner">
          <h2 className="text-2xl font-semibold text-blue-800 mb-4">
            {currentLoan ? 'Modifier un Prêt' : 'Ajouter un Nouveau Prêt'}
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="bookTitle" className="block text-sm font-medium text-gray-700 mb-1">
                Titre du Livre
              </label>
              <input
                type="text"
                id="bookTitle"
                name="bookTitle"
                value={form.bookTitle}
                onChange={handleChange}
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="friendName" className="block text-sm font-medium text-gray-700 mb-1">
                Nom de l'Ami
              </label>
              <input
                type="text"
                id="friendName"
                name="friendName"
                value={form.friendName}
                onChange={handleChange}
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="loanDate" className="block text-sm font-medium text-gray-700 mb-1">
                Date d'Emprunt
              </label>
              <input
                type="date"
                id="loanDate"
                name="loanDate"
                value={form.loanDate}
                onChange={handleChange}
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="returnDate" className="block text-sm font-medium text-gray-700 mb-1">
                Date de Retour (Optionnel)
              </label>
              <input
                type="date"
                id="returnDate"
                name="returnDate"
                value={form.returnDate}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                Statut
              </label>
              <select
                id="status"
                name="status"
                value={form.status}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="Emprunté">Emprunté</option>
                <option value="Rendu">Rendu</option>
              </select>
            </div>
            <div className="col-span-1 md:col-span-2 flex justify-end space-x-3 mt-4">
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-150 ease-in-out"
              >
                {currentLoan ? 'Mettre à jour le Prêt' : 'Ajouter un Prêt'}
              </button>
              {currentLoan && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-6 py-2 bg-gray-300 text-gray-800 font-semibold rounded-md shadow-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition duration-150 ease-in-out"
                >
                  Annuler
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Message de l'application */}
        {message && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-md mb-6" role="alert">
            {message}
          </div>
        )}

        {/* Section du tableau récapitulatif */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Prêts Actuels</h2>
          <div className="mb-4">
            <label htmlFor="search" className="sr-only">Rechercher</label>
            <input
              type="text"
              id="search"
              placeholder="Rechercher un prêt..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>

          <div className="overflow-x-auto rounded-lg shadow-md">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button onClick={() => requestSort('bookTitle')} className="table-header-button">
                      Titre du Livre
                      {sortConfig.key === 'bookTitle' && (
                        <span>{sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'}</span>
                      )}
                    </button>
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button onClick={() => requestSort('friendName')} className="table-header-button">
                      Nom de l'Ami
                      {sortConfig.key === 'friendName' && (
                        <span>{sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'}</span>
                      )}
                    </button>
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button onClick={() => requestSort('loanDate')} className="table-header-button">
                      Date d'Emprunt
                      {sortConfig.key === 'loanDate' && (
                        <span>{sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'}</span>
                      )}
                    </button>
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button onClick={() => requestSort('returnDate')} className="table-header-button">
                      Date de Retour
                      {sortConfig.key === 'returnDate' && (
                        <span>{sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'}</span>
                      )}
                    </button>
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button onClick={() => requestSort('status')} className="table-header-button">
                      Statut
                      {sortConfig.key === 'status' && (
                        <span>{sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'}</span>
                      )}
                    </button>
                  </th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedAndFilteredLoans.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                      Aucun prêt trouvé.
                    </td>
                  </tr>
                ) : (
                  sortedAndFilteredLoans.map((loan) => (
                    <tr key={loan.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {loan.bookTitle}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {loan.friendName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {loan.loanDate}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {loan.returnDate || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          loan.status === 'Emprunté' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {loan.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleEdit(loan)}
                          className="text-indigo-600 hover:text-indigo-900 mr-4 transition duration-150 ease-in-out"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDelete(loan.id)}
                          className="text-red-600 hover:text-red-900 transition duration-150 ease-in-out"
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
