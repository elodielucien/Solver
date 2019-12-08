import {Solver} from 'finitedomain-master/finitedomain-master/src/solver';

         //var submit = document.getElementById('solve');
         //var form = document.getElementById('form');

         /*form.addEventListener('submit', function() {
            //var m1 = document.getElementById('mot1');
            var m1 = 'SEND';
            var m2 = document.getElementById('mot2');
            var m3 = document.getElementById('mot3');
            
            //résolution mot 1
            var totalChiffreMot1 = 0;
            for(var i=0 ; i < m1.length ; i++) {
                var lettre = m1.charAt(i);
                let solver = new Solver();
                solver.decl(lettre, [0,9]);
                solver.solve();
                console.log(solver.solutions);
                alert(solver.solutions);
                //var data = fetch(solver.solutions);
                //totalChiffreMot1 = totalChiffreMot1 + data;
            }
        }) */

        var m1 = 'SEND';
        for(var i=0 ; i < m1.length ; i++) {
            var lettre = m1.charAt(i);
            let solver = new Solver();
            solver.decl(lettre, [0,9]);
            solver.solve();
            console.log(solver.solutions);
            alert(solver.solutions);
            //var data = fetch(solver.solutions);
            //totalChiffreMot1 = totalChiffreMot1 + data;
        }
     
