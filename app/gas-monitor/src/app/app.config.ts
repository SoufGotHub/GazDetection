import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideDatabase, getDatabase } from '@angular/fire/database';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),

    provideFirebaseApp(() =>
      initializeApp({
        apiKey: "API_KEY",
        authDomain: "gazdetector-85aba.firebaseapp.com",
        databaseURL: "https://gazdetector-85aba-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "gazdetector-85aba",
        storageBucket: "gazdetector-85aba.firebasestorage.app",
        messagingSenderId: "462803448802",
        appId: "1:462803448802:web:f63e241281a803510d3fbb"})
    ),

    provideDatabase(() => getDatabase()),
  ]
};