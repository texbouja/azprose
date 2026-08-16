// Vérificateur de fichier de programme indexé.
//   cargo run --example programme_check -- corpus/mp-mpi-mathematiques.md
//
// Rend 0 si le fichier est conforme, 1 s'il porte une anomalie GRAVE. À lancer
// après chaque transcription : c'est ce qui rend la préparation vérifiable.
use azprose_lib::agent::programmes::{contraintes, diagnostiquer, parse_programme};

fn main() {
    let Some(chemin) = std::env::args().nth(1) else {
        eprintln!("usage : cargo run --example programme_check -- <fichier.md>");
        std::process::exit(2);
    };
    let contenu = match std::fs::read_to_string(&chemin) {
        Ok(c) => c,
        Err(e) => { eprintln!("lecture impossible : {e}"); std::process::exit(2); }
    };

    let avis = diagnostiquer(&contenu);
    let graves = avis.iter().filter(|a| a.starts_with("GRAVE")).count();

    match parse_programme(std::path::Path::new(&chemin), &contenu) {
        Some(p) => {
            println!("── Identité ────────────────────────────────────────────");
            println!("  id       : {}", p.id);
            println!("  filière  : {}", p.filiere.join(", "));
            println!("  matière  : {}", p.matiere.as_deref().unwrap_or("—"));
            println!("  niveau   : {}", p.niveau.as_deref().unwrap_or("—"));
            println!("  source   : {}", p.source.as_deref().unwrap_or("—"));
            println!("  statut   : {}", p.statut.as_deref().unwrap_or("complet"));
            if !p.couverture.is_empty() {
                println!("  couverture ({}) :", p.couverture.len());
                for c in &p.couverture { println!("      - {c}"); }
            }
            let cs = contraintes(&p);
            println!("\n── Contraintes extraites : {} ─────────────────────────", cs.len());
            for c in &cs {
                println!("  [{}] {}", c.genre, c.section);
                match &c.porte_sur {
                    Some(i) => println!("       porte sur : {}", tronque(i, 70)),
                    None => println!("       portée    : toute la section"),
                }
                println!("       {}", tronque(&c.texte, 70));
            }
            if cs.is_empty() {
                println!("  (aucune — inhabituel : un programme officiel en comporte presque toujours)");
            }
        }
        None => println!("── Le document ne s'identifie pas (front matter incomplet) ──"),
    }

    println!("\n── Diagnostic : {} anomalie(s), dont {graves} grave(s) ──", avis.len());
    for a in &avis { println!("  · {a}"); }
    if avis.is_empty() { println!("  Aucune. Fichier conforme."); }

    std::process::exit(if graves > 0 { 1 } else { 0 });
}

fn tronque(s: &str, n: usize) -> String {
    if s.chars().count() <= n { return s.to_string(); }
    format!("{}…", s.chars().take(n).collect::<String>())
}
