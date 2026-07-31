# Gestion des colles. 

On profite de l'infrastructure déjà mise en place, en particulier des composants svar DatGrid, Filter et Calendar.  

# Import des colloscopes et de la composition des groupes d'élève. 
Un colloscope est un tableau 2d qui contient les informations sur l'organisations des colles : 
- cinq colonne intitulées : "matière", "colleur", "jour", "horaire" et "salle"
- à partir de la sixième colonne on met en place la rotation des groupes d'élèves, une semaine par colonne. Un cycle de rotation s'achève lorsque on atteint un nombre de semaine égal au nombre de groupes dans la classe.  